/**
 * Generates fixtures/sample-diff-xl.json — a large synthetic diff used to exercise the viewer's
 * performance path (50+ files, 10000+ changed lines, every FileStatus represented).
 *
 * Run: `bun scripts/build-xl-fixture.ts`
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DiffPayload, FileStatus, ParsedFile } from "../src/cli/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

// Deterministic random helpers

// Tiny deterministic PRNG (mulberry32) — stable output across runs.
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const rand = rng(0xc0ffee);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

// Synthetic file paths and source lines

const EXTS = [
    "ts",
    "tsx",
    "js",
    "py",
    "go",
    "rs",
    "md",
    "json",
    "css",
    "sh",
    "yaml",
    "sql",
    "java",
    "rb",
] as const;
type Ext = (typeof EXTS)[number];

const DIRS = [
    "src/components",
    "src/lib",
    "src/utils",
    "src/server",
    "src/cli",
    "src/web/hooks",
    "src/web/pages",
    "src/web/state",
    "src/api/routes",
    "src/api/middleware",
    "src/db/migrations",
    "src/workers",
    "tests/unit",
    "tests/integration",
    "docs",
    "scripts",
    "infra/terraform",
    "config",
] as const;

const NOUNS = [
    "handler",
    "router",
    "store",
    "client",
    "session",
    "auth",
    "token",
    "queue",
    "cache",
    "metrics",
    "logger",
    "tracer",
    "parser",
    "formatter",
    "config",
    "schema",
    "model",
    "view",
    "controller",
    "service",
    "worker",
    "job",
    "task",
    "stream",
    "buffer",
    "pipeline",
    "engine",
] as const;

const usedPaths = new Set<string>();
function uniquePath(): { path: string; ext: Ext } {
    for (let i = 0; i < 50; i++) {
        const dir = pick(DIRS);
        const ext = pick(EXTS);
        const noun1 = pick(NOUNS);
        const noun2 = pick(NOUNS);
        const sep = rand() < 0.5 ? "-" : "_";
        const base = rand() < 0.5 ? noun1 : `${noun1}${sep}${noun2}`;
        const p = `${dir}/${base}.${ext}`;
        if (!usedPaths.has(p)) {
            usedPaths.add(p);
            return { path: p, ext };
        }
    }
    const fallback = `src/generated/file-${usedPaths.size}.ts`;
    usedPaths.add(fallback);
    return { path: fallback, ext: "ts" };
}

const COMMENT_PREFIX: Record<Ext, string> = {
    ts: "//",
    tsx: "//",
    js: "//",
    py: "#",
    go: "//",
    rs: "//",
    md: ">",
    json: "//", // not strictly valid JSON, but the diff is just text
    css: "//",
    sh: "#",
    yaml: "#",
    sql: "--",
    java: "//",
    rb: "#",
};

function codeLine(ext: Ext, kind: "decl" | "logic" | "call" | "comment", n: number): string {
    const noun = pick(NOUNS);
    const noun2 = pick(NOUNS);
    if (kind === "comment") return `${COMMENT_PREFIX[ext]} ${noun} ${noun2} ${n}`;
    switch (ext) {
        case "ts":
        case "tsx":
        case "js":
            if (kind === "decl") return `const ${noun}${n} = create${cap(noun2)}({ id: ${n} });`;
            if (kind === "call") return `await ${noun}.${noun2}(${n});`;
            return `if (${noun}.length > ${n}) { ${noun2}.push(${noun}[${n}]); }`;
        case "py":
            if (kind === "decl") return `${noun}_${n} = build_${noun2}(id=${n})`;
            if (kind === "call") return `    await ${noun}.${noun2}(${n})`;
            return `    if len(${noun}) > ${n}: ${noun2}.append(${noun}[${n}])`;
        case "go":
            if (kind === "decl") return `var ${noun}${n} = New${cap(noun2)}(${n})`;
            if (kind === "call") return `\t${noun}.${cap(noun2)}(${n})`;
            return `\tif len(${noun}) > ${n} { ${noun2} = append(${noun2}, ${noun}[${n}]) }`;
        case "rs":
            if (kind === "decl") return `let ${noun}_${n} = ${cap(noun2)}::new(${n});`;
            if (kind === "call") return `    ${noun}.${noun2}(${n}).await?;`;
            return `    if ${noun}.len() > ${n} { ${noun2}.push(${noun}[${n}].clone()); }`;
        case "md":
            return `- ${noun} ${noun2} item ${n}`;
        case "json":
            return `    "${noun}_${n}": "${noun2}",`;
        case "css":
            return `.${noun}-${n} { color: var(--${noun2}-${n % 9}); }`;
        case "sh":
            return `${noun}_${n}=$(${noun2} --id ${n})`;
        case "yaml":
            return `  ${noun}_${n}: ${noun2}-${n}`;
        case "sql":
            return `SELECT ${noun} FROM ${noun2} WHERE id = ${n};`;
        case "java":
            if (kind === "decl")
                return `private final ${cap(noun)} ${noun2}${n} = new ${cap(noun)}(${n});`;
            return `    ${noun}.${noun2}(${n});`;
        case "rb":
            if (kind === "decl") return `${noun}_${n} = ${cap(noun2)}.new(${n})`;
            return `    ${noun}.${noun2}(${n}) if ${noun}.size > ${n}`;
    }
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function randomLine(ext: Ext, n: number): string {
    const r = rand();
    if (r < 0.15) return codeLine(ext, "comment", n);
    if (r < 0.45) return codeLine(ext, "decl", n);
    if (r < 0.75) return codeLine(ext, "logic", n);
    return codeLine(ext, "call", n);
}

interface HunkSpec {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    rows: Array<{ kind: " " | "-" | "+"; text: string }>;
}

function buildHunk(ext: Ext, oldStart: number, newStart: number): HunkSpec {
    const contextBefore = randInt(1, 3);
    const contextAfter = randInt(1, 3);
    const deletes = randInt(5, 38);
    const adds = randInt(5, 38);
    const interiorContext = randInt(0, 4);

    const rows: HunkSpec["rows"] = [];
    let oldLines = 0;
    let newLines = 0;
    let lineN = oldStart;

    for (let i = 0; i < contextBefore; i++) {
        rows.push({ kind: " ", text: randomLine(ext, lineN++) });
        oldLines++;
        newLines++;
    }
    for (let i = 0; i < deletes; i++) {
        rows.push({ kind: "-", text: randomLine(ext, lineN++) });
        oldLines++;
    }
    for (let i = 0; i < adds; i++) {
        rows.push({ kind: "+", text: randomLine(ext, lineN++) });
        newLines++;
    }
    for (let i = 0; i < interiorContext; i++) {
        rows.push({ kind: " ", text: randomLine(ext, lineN++) });
        oldLines++;
        newLines++;
    }
    for (let i = 0; i < contextAfter; i++) {
        rows.push({ kind: " ", text: randomLine(ext, lineN++) });
        oldLines++;
        newLines++;
    }

    return { oldStart, oldLines, newStart, newLines, rows };
}

function renderHunk(h: HunkSpec): string {
    const header = `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
    const body = h.rows.map((r) => `${r.kind}${r.text}`).join("\n");
    return `${header}\n${body}`;
}

function linesFromPrefixedRows(rows: string[]): string {
    return rows.map((row) => row.slice(1)).join("\n") + "\n";
}

function fillerLine(ext: Ext, lineNumber: number): string {
    if (ext === "md") return `- unchanged context ${lineNumber}`;
    return `${COMMENT_PREFIX[ext]} unchanged context ${lineNumber}`;
}

function buildContentsFromHunks(
    ext: Ext,
    hunks: HunkSpec[],
): Pick<ParsedFile, "oldContents" | "newContents"> {
    const oldLines = new Map<number, string>();
    const newLines = new Map<number, string>();

    for (const hunk of hunks) {
        let oldLine = hunk.oldStart;
        let newLine = hunk.newStart;
        for (const row of hunk.rows) {
            if (row.kind === " ") {
                oldLines.set(oldLine, row.text);
                newLines.set(newLine, row.text);
                oldLine += 1;
                newLine += 1;
            } else if (row.kind === "-") {
                oldLines.set(oldLine, row.text);
                oldLine += 1;
            } else {
                newLines.set(newLine, row.text);
                newLine += 1;
            }
        }
    }

    const maxOld = Math.max(0, ...oldLines.keys());
    const maxNew = Math.max(0, ...newLines.keys());
    const oldContents = Array.from({ length: maxOld }, (_, i) => {
        const lineNumber = i + 1;
        return oldLines.get(lineNumber) ?? fillerLine(ext, lineNumber);
    }).join("\n");
    const newContents = Array.from({ length: maxNew }, (_, i) => {
        const lineNumber = i + 1;
        return newLines.get(lineNumber) ?? fillerLine(ext, lineNumber);
    }).join("\n");

    return {
        oldContents: oldContents ? `${oldContents}\n` : "",
        newContents: newContents ? `${newContents}\n` : "",
    };
}

function shortSha(n: number): string {
    return n.toString(16).padStart(7, "0").slice(0, 7);
}

let shaCounter = 0x1000000;
function nextSha(): string {
    shaCounter += 0x12345;
    return shortSha(shaCounter);
}

// File-status builders

function buildModified(path: string, ext: Ext, hunkCount: number): ParsedFile {
    const hunks: HunkSpec[] = [];
    let oldPos = randInt(1, 30);
    let newPos = oldPos;
    let additions = 0;
    let deletions = 0;
    for (let i = 0; i < hunkCount; i++) {
        const h = buildHunk(ext, oldPos, newPos);
        hunks.push(h);
        additions += h.rows.filter((r) => r.kind === "+").length;
        deletions += h.rows.filter((r) => r.kind === "-").length;
        const gap = randInt(8, 40);
        oldPos += h.oldLines + gap;
        newPos += h.newLines + gap;
    }
    const head = [
        `diff --git a/${path} b/${path}`,
        `index ${nextSha()}..${nextSha()} 100644`,
        `--- a/${path}`,
        `+++ b/${path}`,
    ].join("\n");
    const body = hunks.map(renderHunk).join("\n");
    return {
        path,
        status: "modified",
        additions,
        deletions,
        rawPatch: `${head}\n${body}\n`,
        ...buildContentsFromHunks(ext, hunks),
    };
}

function buildAdded(path: string, ext: Ext, lineCount: number): ParsedFile {
    const rows: string[] = [];
    for (let i = 0; i < lineCount; i++) rows.push(`+${randomLine(ext, i + 1)}`);
    const head = [
        `diff --git a/${path} b/${path}`,
        `new file mode 100644`,
        `index 0000000..${nextSha()}`,
        `--- /dev/null`,
        `+++ b/${path}`,
        `@@ -0,0 +1,${lineCount} @@`,
    ].join("\n");
    return {
        path,
        status: "added",
        additions: lineCount,
        deletions: 0,
        rawPatch: `${head}\n${rows.join("\n")}\n`,
        oldContents: "",
        newContents: linesFromPrefixedRows(rows),
    };
}

function buildUntracked(path: string, ext: Ext, lineCount: number): ParsedFile {
    const file = buildAdded(path, ext, lineCount);
    return { ...file, status: "untracked" };
}

function buildDeleted(path: string, ext: Ext, lineCount: number): ParsedFile {
    const rows: string[] = [];
    for (let i = 0; i < lineCount; i++) rows.push(`-${randomLine(ext, i + 1)}`);
    const head = [
        `diff --git a/${path} b/${path}`,
        `deleted file mode 100644`,
        `index ${nextSha()}..0000000`,
        `--- a/${path}`,
        `+++ /dev/null`,
        `@@ -1,${lineCount} +0,0 @@`,
    ].join("\n");
    return {
        path,
        status: "deleted",
        additions: 0,
        deletions: lineCount,
        rawPatch: `${head}\n${rows.join("\n")}\n`,
        oldContents: linesFromPrefixedRows(rows),
        newContents: "",
    };
}

function buildRenamedWithEdits(newPath: string, oldPath: string, ext: Ext): ParsedFile {
    const modified = buildModified(newPath, ext, randInt(1, 3));
    const head = [
        `diff --git a/${oldPath} b/${newPath}`,
        `similarity index 78%`,
        `rename from ${oldPath}`,
        `rename to ${newPath}`,
        `index ${nextSha()}..${nextSha()} 100644`,
        `--- a/${oldPath}`,
        `+++ b/${newPath}`,
    ].join("\n");
    const bodyMatch = modified.rawPatch.split("\n").slice(4).join("\n");
    return {
        path: newPath,
        oldPath,
        status: "renamed",
        additions: modified.additions,
        deletions: modified.deletions,
        rawPatch: `${head}\n${bodyMatch}`,
        oldContents: modified.oldContents,
        newContents: modified.newContents,
    };
}

function buildRenamedNoEdits(newPath: string, oldPath: string): ParsedFile {
    return {
        path: newPath,
        oldPath,
        status: "renamed",
        additions: 0,
        deletions: 0,
        rawPatch: "",
        skipped: { reason: "no-hunks" },
    };
}

function buildSkipped(
    path: string,
    reason: "binary" | "too-large" | "no-hunks",
    sizeBytes?: number,
): ParsedFile {
    return {
        path,
        status: "modified" as FileStatus,
        additions: 0,
        deletions: 0,
        rawPatch: "",
        binary: reason === "binary" ? true : undefined,
        skipped: sizeBytes ? { reason, sizeBytes } : { reason },
    };
}

// Payload assembly

const files: ParsedFile[] = [];

// 5 added files, larger
for (let i = 0; i < 5; i++) {
    const { path, ext } = uniquePath();
    files.push(buildAdded(path, ext, randInt(80, 600)));
}

// 25 modified files
for (let i = 0; i < 25; i++) {
    const { path, ext } = uniquePath();
    files.push(buildModified(path, ext, randInt(3, 12)));
}

// 5 deleted files
for (let i = 0; i < 5; i++) {
    const { path, ext } = uniquePath();
    files.push(buildDeleted(path, ext, randInt(10, 80)));
}

// 3 renamed files
for (let i = 0; i < 3; i++) {
    const { path: newPath, ext } = uniquePath();
    const { path: oldPath } = uniquePath();
    if (i === 0) {
        files.push(buildRenamedNoEdits(newPath, oldPath));
    } else {
        files.push(buildRenamedWithEdits(newPath, oldPath, ext));
    }
}

// 12 untracked files
for (let i = 0; i < 12; i++) {
    const { path, ext } = uniquePath();
    files.push(buildUntracked(path, ext, randInt(40, 200)));
}

// skipped entries
files.push(buildSkipped("assets/logo-v2.png", "binary"));
files.push(buildSkipped("infra/terraform/state.tfvars", "too-large", 5_000_000));
files.push(buildSkipped("scripts/mode-only-change.sh", "no-hunks"));

const totalChanged = files.reduce((n, f) => n + f.additions + f.deletions, 0);

if (files.length < 50) throw new Error(`fixture too small: ${files.length} files`);
if (totalChanged < 10000) throw new Error(`fixture too small: ${totalChanged} changed lines`);

const payload: DiffPayload = {
    repoRoot: "/example/xl-repo",
    branch: "perf-test",
    head: "deadbeef0123456789abcdef0123456789abcdef",
    generatedAt: "2026-05-19T00:00:00.000Z",
    files,
};

const outPath = path.join(repoRoot, "fixtures", "sample-diff-xl.json");
await writeFile(outPath, JSON.stringify(payload, null, 4) + "\n", "utf8");

console.log(
    `wrote ${outPath} — ${files.length} files, ${totalChanged} changed lines (additions+deletions)`,
);
