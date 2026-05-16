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

interface PatchLineIndex {
    additions: Map<number, string>;
    deletions: Map<number, string>;
}

function indexPatchLines(rawPatch: string): PatchLineIndex {
    const additions = new Map<number, string>();
    const deletions = new Map<number, string>();
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
            addLine += 1;
        } else if (prefix === "-") {
            deletions.set(delLine, text);
            delLine += 1;
        } else if (prefix === " ") {
            additions.set(addLine, text);
            deletions.set(delLine, text);
            addLine += 1;
            delLine += 1;
        }
    }
    return { additions, deletions };
}

export function lookupLineText(
    file: ParsedFile,
    side: CommentSide,
    lineNumber: number,
): string | undefined {
    const idx = indexPatchLines(file.rawPatch);
    const map = side === "additions" ? idx.additions : idx.deletions;
    return map.get(lineNumber);
}

export function markStaleComments(comments: CommentMap, files: ParsedFile[]): CommentMap {
    const byPath = new Map(files.map((f) => [f.path, f] as const));
    const next: CommentMap = {};
    for (const [path, list] of Object.entries(comments)) {
        const file = byPath.get(path);
        if (!file) {
            next[path] = list.map((c) => (c.stale ? c : { ...c, stale: true }));
            continue;
        }
        const idx = indexPatchLines(file.rawPatch);
        next[path] = list.map((c) => {
            const map = c.side === "additions" ? idx.additions : idx.deletions;
            const current = map.get(c.lineNumber);
            const stale = current === undefined || current !== c.lineText;
            if (stale === Boolean(c.stale)) return c;
            return { ...c, stale };
        });
    }
    return next;
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

    const repoName = payload.repoRoot.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
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
