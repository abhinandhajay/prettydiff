import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import parseDiffLib from "parse-diff";

import type { DiffPayload, ParsedFile, FileStatus } from "./types.js";

const NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";
const MAX_UNTRACKED_BYTES = 512 * 1024;
const MAX_CONTENT_BYTES = 512 * 1024;

interface RunResult {
    stdout: string;
    stderr: string;
    code: number;
}

function run(
    cmd: string,
    args: string[],
    cwd: string,
    allowedExitCodes: number[] = [0],
): Promise<RunResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
        child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
        child.on("error", reject);
        child.on("close", (code: number | null) => {
            const c = code ?? 0;
            if (allowedExitCodes.includes(c)) {
                resolve({ stdout, stderr, code: c });
            } else {
                reject(
                    new Error(
                        `${cmd} ${args.join(" ")} exited ${c}: ${stderr.trim() || stdout.trim()}`,
                    ),
                );
            }
        });
    });
}

export async function getRepoRoot(cwd: string): Promise<string | null> {
    try {
        const r = await run("git", ["rev-parse", "--show-toplevel"], cwd);
        return r.stdout.trim() || null;
    } catch {
        return null;
    }
}

async function getBranch(cwd: string): Promise<string> {
    try {
        const r = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
        return r.stdout.trim();
    } catch {
        return "(detached)";
    }
}

async function getHead(cwd: string): Promise<string> {
    try {
        const r = await run("git", ["rev-parse", "--short", "HEAD"], cwd);
        return r.stdout.trim();
    } catch {
        return "";
    }
}

async function getTrackedDiff(cwd: string): Promise<string> {
    const r = await run(
        "git",
        ["diff", "HEAD", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/"],
        cwd,
    );
    return r.stdout;
}

async function getFileAtHead(cwd: string, relPath: string): Promise<string | null> {
    try {
        // exit 128 means the path doesn't exist at HEAD (e.g. an added file).
        const r = await run("git", ["show", `HEAD:${relPath}`], cwd, [0, 128]);
        return r.code === 0 ? r.stdout : null;
    } catch {
        return null;
    }
}

async function readWorkingTreeFile(cwd: string, relPath: string): Promise<string | null> {
    try {
        return await readFile(path.join(cwd, relPath), "utf8");
    } catch {
        return null;
    }
}

interface FileSides {
    oldContents: string;
    newContents: string;
    sizeBytes: number;
}

async function loadFileSides(cwd: string, file: ParsedFile): Promise<FileSides | "too-large"> {
    const oldRef = file.oldPath ?? file.path;
    const needsOld = file.status !== "added" && file.status !== "untracked";
    const needsNew = file.status !== "deleted";

    const [oldRaw, newRaw] = await Promise.all([
        needsOld ? getFileAtHead(cwd, oldRef) : Promise.resolve(""),
        needsNew ? readWorkingTreeFile(cwd, file.path) : Promise.resolve(""),
    ]);

    const oldContents = oldRaw ?? "";
    const newContents = newRaw ?? "";
    const sizeBytes = Math.max(
        Buffer.byteLength(oldContents, "utf8"),
        Buffer.byteLength(newContents, "utf8"),
    );
    if (sizeBytes > MAX_CONTENT_BYTES) return "too-large";
    return { oldContents, newContents, sizeBytes };
}

async function getUntrackedFiles(cwd: string): Promise<string[]> {
    const r = await run("git", ["ls-files", "--others", "--exclude-standard", "-z"], cwd);
    if (!r.stdout) return [];
    return r.stdout.split("\0").filter(Boolean);
}

async function synthesizeUntrackedPatch(cwd: string, relPath: string): Promise<string> {
    const abs = path.join(cwd, relPath);
    let size = 0;
    try {
        const s = await stat(abs);
        size = s.size;
    } catch {
        return "";
    }

    if (size > MAX_UNTRACKED_BYTES) {
        const kb = Math.round(size / 1024);
        return [
            `diff --git a/${relPath} b/${relPath}`,
            `new file mode 100644`,
            `Binary files /dev/null and b/${relPath} differ`,
            `--- /dev/null`,
            `+++ b/${relPath}`,
            `@@ -0,0 +1,1 @@`,
            `+[prettydiff: file skipped — ${kb} KB exceeds 512 KB limit]`,
            "",
        ].join("\n");
    }

    const r = await run(
        "git",
        ["diff", "--no-index", "--no-color", "--no-ext-diff", NULL_DEVICE, relPath],
        cwd,
        [0, 1],
    );
    if (!r.stdout) return "";

    return r.stdout.replace(
        new RegExp(`^diff --git a/${escapeRegex(NULL_DEVICE)} b/${escapeRegex(relPath)}`, "m"),
        `diff --git a/${relPath} b/${relPath}`,
    );
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitCombinedPatch(combined: string): string[] {
    if (!combined.trim()) return [];
    const parts = combined.split(/(?=^diff --git )/m);
    return parts.filter((p) => p.trim().length > 0);
}

function inferStatus(parsed: parseDiffLib.File, isUntracked: boolean): FileStatus {
    if (isUntracked) return "untracked";
    if (parsed.new) return "added";
    if (parsed.deleted) return "deleted";
    if (
        parsed.from &&
        parsed.to &&
        parsed.from !== parsed.to &&
        parsed.from !== "/dev/null" &&
        parsed.to !== "/dev/null"
    ) {
        return "renamed";
    }
    return "modified";
}

function normalizePath(parsed: parseDiffLib.File): { path: string; oldPath?: string } {
    const to = parsed.to;
    const from = parsed.from;
    if (parsed.deleted && from) return { path: from };
    if (parsed.new && to) return { path: to };
    if (from && to && from !== to) return { path: to, oldPath: from };
    return { path: to ?? from ?? "(unknown)" };
}

export async function getDiffPayload(cwd: string): Promise<DiffPayload | null> {
    const repoRoot = await getRepoRoot(cwd);
    if (!repoRoot) return null;

    const [trackedPatch, untrackedList, branch, head] = await Promise.all([
        getTrackedDiff(repoRoot),
        getUntrackedFiles(repoRoot),
        getBranch(repoRoot),
        getHead(repoRoot),
    ]);

    const synthesized = await Promise.all(
        untrackedList.map(async (rel) => ({
            rel,
            patch: await synthesizeUntrackedPatch(repoRoot, rel),
        })),
    );
    const untrackedPaths = new Set<string>();
    const untrackedPatches: string[] = [];
    for (const { rel, patch } of synthesized) {
        if (patch) {
            untrackedPaths.add(rel);
            untrackedPatches.push(patch);
        }
    }

    const combined = [trackedPatch, ...untrackedPatches].filter((s) => s && s.trim()).join("\n");

    const fileBlocks = splitCombinedPatch(combined);

    const files: ParsedFile[] = [];
    for (const block of fileBlocks) {
        const parsedArr = parseDiffLib(block);
        const isBinary = /^Binary files .* differ$/m.test(block);
        for (const p of parsedArr) {
            const { path: filePath, oldPath } = normalizePath(p);
            const isUntracked = untrackedPaths.has(filePath);
            const status = inferStatus(p, isUntracked);
            const hasHunks = (p.chunks?.length ?? 0) > 0;
            const skipped: ParsedFile["skipped"] = isBinary
                ? { reason: "binary" }
                : !hasHunks
                  ? { reason: "no-hunks" }
                  : undefined;
            files.push({
                path: filePath,
                oldPath,
                status,
                additions: p.additions ?? 0,
                deletions: p.deletions ?? 0,
                rawPatch: skipped ? "" : block,
                ...(isBinary ? { binary: true } : {}),
                ...(skipped ? { skipped } : {}),
            });
        }
    }

    await Promise.all(
        files.map(async (file) => {
            if (file.skipped || file.binary) return;
            const sides = await loadFileSides(repoRoot, file);
            if (sides === "too-large") {
                file.rawPatch = "";
                file.skipped = { reason: "too-large" };
                return;
            }
            file.oldContents = sides.oldContents;
            file.newContents = sides.newContents;
        }),
    );

    return {
        repoRoot,
        branch,
        head,
        generatedAt: new Date().toISOString(),
        files,
    };
}
