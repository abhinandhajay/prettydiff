import { spawn } from "node:child_process";
import { lstat, readFile, readlink, stat } from "node:fs/promises";
import path from "node:path";

import parseDiffLib from "parse-diff";

import type { BranchRef, DiffOptions, DiffPayload, ParsedFile, FileStatus } from "./types.js";

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

async function getBranches(cwd: string, currentBranch: string): Promise<BranchRef[]> {
    try {
        const r = await run(
            "git",
            ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"],
            cwd,
        );
        const seen = new Set<string>();
        const branches: BranchRef[] = [];
        for (const line of r.stdout.split("\n")) {
            const name = line.trim();
            if (!name || name.endsWith("/HEAD") || seen.has(name)) continue;
            seen.add(name);
            branches.push({ name, ...(name === currentBranch ? { current: true } : {}) });
        }
        if (currentBranch && currentBranch !== "HEAD" && currentBranch !== "(detached)") {
            if (!seen.has(currentBranch)) {
                branches.unshift({ name: currentBranch, current: true });
            }
        }
        return branches.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        return currentBranch && currentBranch !== "(detached)"
            ? [{ name: currentBranch, current: true }]
            : [{ name: "HEAD", current: true }];
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

async function getTrackedDiff(
    cwd: string,
    baseRef: string,
    newRef: string | null,
): Promise<string> {
    const r = await run(
        "git",
        [
            "diff",
            baseRef,
            ...(newRef ? [newRef] : []),
            "--no-color",
            "--no-ext-diff",
            "--ignore-cr-at-eol",
            "--src-prefix=a/",
            "--dst-prefix=b/",
        ],
        cwd,
    );
    return normalizeLineEndings(r.stdout);
}

async function getFileAtRef(cwd: string, ref: string, relPath: string): Promise<string | null> {
    try {
        // exit 128 means the path doesn't exist at the ref (e.g. an added file).
        const r = await run("git", ["show", `${ref}:${relPath}`], cwd, [0, 128]);
        return r.code === 0 ? r.stdout : null;
    } catch {
        return null;
    }
}

async function readWorkingTreeFile(cwd: string, relPath: string): Promise<string | null> {
    try {
        const filePath = path.join(cwd, relPath);
        const fileStat = await lstat(filePath);
        return fileStat.isSymbolicLink()
            ? await readlink(filePath, "utf8")
            : await readFile(filePath, "utf8");
    } catch {
        return null;
    }
}

function normalizeLineEndings(contents: string): string {
    return contents.replace(/\r\n/g, "\n");
}

interface FileSides {
    oldContents: string;
    newContents: string;
    sizeBytes: number;
}

async function loadFileSides(
    cwd: string,
    file: ParsedFile,
    baseRef: string,
    newRef: string | null,
): Promise<FileSides | "too-large"> {
    const oldRef = file.oldPath ?? file.path;
    const needsOld = file.status !== "added" && file.status !== "untracked";
    const needsNew = file.status !== "deleted";

    const [oldRaw, newRaw] = await Promise.all([
        needsOld ? getFileAtRef(cwd, baseRef, oldRef) : Promise.resolve(""),
        needsNew
            ? newRef
                ? getFileAtRef(cwd, newRef, file.path)
                : readWorkingTreeFile(cwd, file.path)
            : Promise.resolve(""),
    ]);

    const oldContents = oldRaw ?? "";
    const newContents = newRaw ?? "";
    const sizeBytes = Math.max(
        Buffer.byteLength(oldContents, "utf8"),
        Buffer.byteLength(newContents, "utf8"),
    );
    if (sizeBytes > MAX_CONTENT_BYTES) return "too-large";
    return {
        oldContents: normalizeLineEndings(oldContents),
        newContents: normalizeLineEndings(newContents),
        sizeBytes,
    };
}

async function getUntrackedFiles(cwd: string): Promise<string[]> {
    const r = await run("git", ["ls-files", "--others", "--exclude-standard", "-z"], cwd);
    if (!r.stdout) return [];
    return r.stdout.split("\0").filter(Boolean);
}

async function synthesizeUntrackedPatch(
    cwd: string,
    relPath: string,
): Promise<{ patch: string; tooLarge?: boolean }> {
    const abs = path.join(cwd, relPath);
    let size = 0;
    try {
        const s = await stat(abs);
        size = s.size;
    } catch {
        return { patch: "" };
    }

    if (size > MAX_UNTRACKED_BYTES) {
        // Placeholder hunk keeps the file visible in the payload; the caller
        // marks it too-large and clears the patch before serving.
        const kb = Math.round(size / 1024);
        const patch = [
            `diff --git a/${relPath} b/${relPath}`,
            `new file mode 100644`,
            `--- /dev/null`,
            `+++ b/${relPath}`,
            `@@ -0,0 +1,1 @@`,
            `+[prettydiff: file skipped — ${kb} KB exceeds 512 KB limit]`,
            "",
        ].join("\n");
        return { patch, tooLarge: true };
    }

    const r = await run(
        "git",
        ["diff", "--no-index", "--no-color", "--no-ext-diff", NULL_DEVICE, relPath],
        cwd,
        [0, 1],
    );
    if (!r.stdout) return { patch: "" };

    return {
        patch: normalizeLineEndings(
            r.stdout.replace(
                new RegExp(
                    `^diff --git a/${escapeRegex(NULL_DEVICE)} b/${escapeRegex(relPath)}`,
                    "m",
                ),
                `diff --git a/${relPath} b/${relPath}`,
            ),
        ),
    };
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitCombinedPatch(combined: string): string[] {
    if (!combined.trim()) return [];
    const parts = combined.split(/(?=^diff --git )/m);
    return parts.filter((p) => p.trim().length > 0);
}

function getPatchPaths(patch: string): Set<string> {
    const paths = new Set<string>();
    for (const block of splitCombinedPatch(patch)) {
        for (const parsed of parseDiffLib(block)) {
            const { path: filePath, oldPath } = normalizePath(parsed);
            paths.add(filePath);
            if (oldPath) paths.add(oldPath);
        }
    }
    return paths;
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

async function resolveTargetRef(
    cwd: string,
    requestedTargetRef: string | undefined,
    currentBranch: string,
): Promise<string> {
    const fallback = currentBranch && currentBranch !== "(detached)" ? currentBranch : "HEAD";
    const targetRef = requestedTargetRef?.trim() || fallback;
    try {
        await run("git", ["rev-parse", "--verify", `${targetRef}^{commit}`], cwd);
        return targetRef;
    } catch {
        return fallback;
    }
}

async function resolveMergeBase(cwd: string, targetRef: string): Promise<string | null> {
    try {
        // exit 1 means no common ancestor (unrelated histories).
        const r = await run("git", ["merge-base", targetRef, "HEAD"], cwd, [0, 1]);
        const sha = r.stdout.trim();
        return r.code === 0 && sha ? sha : null;
    } catch {
        return null;
    }
}

export async function getDiffPayload(
    cwd: string,
    requestedOptions: Partial<DiffOptions> = {},
): Promise<DiffPayload | null> {
    const repoRoot = await getRepoRoot(cwd);
    if (!repoRoot) return null;

    const [branch, head] = await Promise.all([getBranch(repoRoot), getHead(repoRoot)]);
    const target = requestedOptions.target ?? "working-tree";
    const targetRef =
        target === "branch"
            ? await resolveTargetRef(repoRoot, requestedOptions.targetRef, branch)
            : undefined;
    const mergeBase = targetRef ? await resolveMergeBase(repoRoot, targetRef) : null;
    const baseRef = target === "branch" ? (mergeBase ?? targetRef ?? "HEAD") : "HEAD";
    const includeWorkingTree = target !== "branch" || (requestedOptions.includeWorkingTree ?? true);
    const newRef = includeWorkingTree ? null : "HEAD";

    const [trackedPatch, untrackedList, branches] = await Promise.all([
        getTrackedDiff(repoRoot, baseRef, newRef),
        includeWorkingTree ? getUntrackedFiles(repoRoot) : Promise.resolve([]),
        getBranches(repoRoot, branch),
    ]);

    const trackedPaths = getPatchPaths(trackedPatch);
    const synthesized = await Promise.all(
        untrackedList
            .filter((rel) => !trackedPaths.has(rel))
            .map(async (rel) => ({
                rel,
                ...(await synthesizeUntrackedPatch(repoRoot, rel)),
            })),
    );
    const untrackedPaths = new Set<string>();
    const oversizedPaths = new Set<string>();
    const untrackedPatches: string[] = [];
    for (const { rel, patch, tooLarge } of synthesized) {
        if (patch) {
            untrackedPaths.add(rel);
            if (tooLarge) oversizedPaths.add(rel);
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
                : oversizedPaths.has(filePath)
                  ? { reason: "too-large" }
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
            const sides = await loadFileSides(repoRoot, file, baseRef, newRef);
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
        branches,
        head,
        target,
        ...(targetRef ? { targetRef } : {}),
        ...(mergeBase ? { mergeBase } : {}),
        ...(target === "branch" ? { includeWorkingTree } : {}),
        generatedAt: new Date().toISOString(),
        files,
    };
}
