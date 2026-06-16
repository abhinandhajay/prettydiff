import { repoBasename } from "@/lib/format";

import type { CommentMap, CommentSide, DiffComment, DiffPayload, ParsedFile } from "@/lib/types";

export interface CommentLocation {
    filePath: string;
    side: CommentSide;
    lineNumber: number;
}

export function commentKey(loc: CommentLocation): string {
    return `${loc.filePath}::${loc.side}::${loc.lineNumber}`;
}

export function commentsByKey(comments: DiffComment[]): Map<string, DiffComment[]> {
    const map = new Map<string, DiffComment[]>();
    for (const c of comments) {
        const k = commentKey(c);
        const existing = map.get(k);
        if (existing) existing.push(c);
        else map.set(k, [c]);
    }
    return map;
}

export interface PatchLineIndex {
    additions: Map<number, string>;
    deletions: Map<number, string>;
    /** New-file line numbers that are genuine additions (`+` in the patch). */
    changedAdditions: Set<number>;
    /** Old-file line numbers that are genuine deletions (`-` in the patch). */
    changedDeletions: Set<number>;
    /** New-file line numbers present in the original patch (changes + context). */
    patchAdditions: Set<number>;
    /** Old-file line numbers present in the original patch (changes + context). */
    patchDeletions: Set<number>;
}

interface PatchScan {
    additions: Map<number, string>;
    deletions: Map<number, string>;
    changedAdditions: Set<number>;
    changedDeletions: Set<number>;
}

function scanPatch(rawPatch: string): PatchScan {
    const additions = new Map<number, string>();
    const deletions = new Map<number, string>();
    const changedAdditions = new Set<number>();
    const changedDeletions = new Set<number>();
    let addLine = 0;
    let delLine = 0;
    let inHunk = false;

    for (const raw of rawPatch.split("\n")) {
        if (raw.startsWith("@@")) {
            const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
            if (match) {
                delLine = Number(match[1]);
                addLine = Number(match[2]);
                inHunk = true;
            }
            continue;
        }
        if (!inHunk) continue;
        if (raw.startsWith("\\")) continue;
        const prefix = raw[0];
        const text = raw.slice(1);
        if (prefix === "+") {
            additions.set(addLine, text);
            changedAdditions.add(addLine);
            addLine += 1;
        } else if (prefix === "-") {
            deletions.set(delLine, text);
            changedDeletions.add(delLine);
            delLine += 1;
        } else if (prefix === " ") {
            additions.set(addLine, text);
            deletions.set(delLine, text);
            addLine += 1;
            delLine += 1;
        }
    }
    return { additions, deletions, changedAdditions, changedDeletions };
}

export function buildPatchIndex(rawPatch: string): PatchLineIndex {
    const scan = scanPatch(rawPatch);
    return {
        additions: scan.additions,
        deletions: scan.deletions,
        changedAdditions: scan.changedAdditions,
        changedDeletions: scan.changedDeletions,
        patchAdditions: new Set(scan.additions.keys()),
        patchDeletions: new Set(scan.deletions.keys()),
    };
}

function splitFileLines(contents: string): string[] {
    const lines = contents.split("\n");
    // A trailing newline yields a spurious empty final element — drop it so the
    // line count matches the file's actual lines.
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return lines;
}

/**
 * Index built from the full file contents so comments can attach to any visible line — including
 * context revealed by expansion, which never appears in the patch. The patch is still scanned to
 * mark which lines are genuine changes vs context (and which context lines were inside the original
 * hunks).
 */
export function buildContentsIndex(file: ParsedFile): PatchLineIndex {
    const scan = scanPatch(file.rawPatch);
    const additions = new Map<number, string>();
    const deletions = new Map<number, string>();

    splitFileLines(file.newContents ?? "").forEach((text, i) => additions.set(i + 1, text));
    splitFileLines(file.oldContents ?? "").forEach((text, i) => deletions.set(i + 1, text));

    return {
        additions,
        deletions,
        changedAdditions: scan.changedAdditions,
        changedDeletions: scan.changedDeletions,
        patchAdditions: new Set(scan.additions.keys()),
        patchDeletions: new Set(scan.deletions.keys()),
    };
}

export function buildFileIndex(file: ParsedFile): PatchLineIndex {
    if (file.oldContents !== undefined || file.newContents !== undefined) {
        return buildContentsIndex(file);
    }
    return buildPatchIndex(file.rawPatch);
}

export function markStaleComments(
    comments: CommentMap,
    files: ParsedFile[],
    indexByPath?: Map<string, PatchLineIndex>,
): CommentMap {
    const byPath = new Map(files.map((f) => [f.path, f] as const));
    const next: CommentMap = {};
    let changed = false;
    for (const [path, list] of Object.entries(comments)) {
        const file = byPath.get(path);
        if (!file) {
            let listChanged = false;
            const updated = list.map((c) => {
                if (c.stale) return c;
                listChanged = true;
                return { ...c, stale: true };
            });
            if (listChanged) changed = true;
            next[path] = listChanged ? updated : list;
            continue;
        }
        const idx = indexByPath?.get(path) ?? buildFileIndex(file);
        let listChanged = false;
        const updated = list.map((c) => {
            const map = c.side === "additions" ? idx.additions : idx.deletions;
            const current = map.get(c.lineNumber);
            const stale = current === undefined || current !== c.lineText;
            if (stale === Boolean(c.stale)) return c;
            listChanged = true;
            return { ...c, stale };
        });
        if (listChanged) changed = true;
        next[path] = listChanged ? updated : list;
    }
    return changed ? next : comments;
}

export function allCommentIds(comments: CommentMap, includeStale = false): string[] {
    const ids: string[] = [];
    for (const list of Object.values(comments)) {
        for (const c of list) {
            if (!includeStale && c.stale) continue;
            ids.push(c.id);
        }
    }
    return ids;
}

const EXT_TO_LANG: Record<string, string> = {
    ts: "ts",
    tsx: "tsx",
    js: "js",
    jsx: "jsx",
    mjs: "js",
    cjs: "js",
    json: "json",
    md: "md",
    css: "css",
    scss: "scss",
    html: "html",
    py: "py",
    rb: "rb",
    go: "go",
    rs: "rs",
    java: "java",
    kt: "kt",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    cs: "cs",
    php: "php",
    sh: "sh",
    bash: "sh",
    zsh: "sh",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    sql: "sql",
};

function langFromPath(path: string): string {
    const base = path.split("/").pop() ?? "";
    const dot = base.lastIndexOf(".");
    if (dot < 0) return "";
    return EXT_TO_LANG[base.slice(dot + 1).toLowerCase()] ?? "";
}

function sideLabel(side: CommentSide, lineType: DiffComment["lineType"]): string {
    if (lineType === "change-addition") return "added";
    if (lineType === "change-deletion") return "deleted";
    if (side === "deletions") return "context (old)";
    return "context";
}

export function formatCommentsForCopy(
    selectedIds: Set<string>,
    comments: CommentMap,
    payload: Pick<DiffPayload, "repoRoot" | "branch" | "head">,
): string {
    const selectedByFile: Array<{ path: string; items: DiffComment[] }> = [];
    for (const [path, list] of Object.entries(comments)) {
        const items = list
            .filter((c) => selectedIds.has(c.id) && !c.stale)
            .sort((a, b) => a.lineNumber - b.lineNumber);
        if (items.length > 0) selectedByFile.push({ path, items });
    }

    const repoName = repoBasename(payload.repoRoot);
    const head = payload.head ? payload.head.slice(0, 7) : "";

    const lines: string[] = [
        "# Code review comments",
        "",
        `Repo: ${repoName} · Branch: ${payload.branch}${head ? ` · HEAD: ${head}` : ""}`,
        `Generated: ${new Date().toISOString()}`,
        "",
    ];

    if (selectedByFile.length === 0) {
        lines.push("_No comments selected._", "");
        return lines.join("\n");
    }

    for (const { path, items } of selectedByFile) {
        lines.push(`## ${path}`, "");
        const lang = langFromPath(path);
        for (const c of items) {
            lines.push(`### Line ${c.lineNumber} (${sideLabel(c.side, c.lineType)})`, "");
            lines.push("```" + lang, c.lineText, "```", "");
            for (const para of c.body.split("\n")) {
                lines.push(`> ${para}`);
            }
            lines.push("");
        }
    }
    return lines.join("\n").trimEnd() + "\n";
}
