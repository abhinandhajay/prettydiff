import type { CommentLineType, CommentMap, CommentSide, DiffComment, ParsedFile } from "./types.js";

interface LineInfo {
    text: string;
    lineType: CommentLineType;
}

function changedLines(rawPatch: string): { additions: Set<number>; deletions: Set<number> } {
    const additions = new Set<number>();
    const deletions = new Set<number>();
    let addLine = 0;
    let delLine = 0;
    let inHunk = false;
    for (const line of rawPatch.split("\n")) {
        if (line.startsWith("@@")) {
            const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
            if (match) {
                delLine = Number(match[1]);
                addLine = Number(match[2]);
                inHunk = true;
            }
            continue;
        }
        if (!inHunk || line.startsWith("\\")) continue;
        if (line.startsWith("+")) {
            additions.add(addLine++);
        } else if (line.startsWith("-")) {
            deletions.add(delLine++);
        } else if (line.startsWith(" ")) {
            addLine++;
            delLine++;
        }
    }
    return { additions, deletions };
}

export function lineInfo(file: ParsedFile, side: CommentSide, lineNumber: number): LineInfo | null {
    const contents = side === "additions" ? file.newContents : file.oldContents;
    if (contents === undefined || !Number.isInteger(lineNumber) || lineNumber < 1) return null;
    const lines = contents.split("\n");
    if (lines.at(-1) === "") lines.pop();
    const text = lines[lineNumber - 1];
    if (text === undefined) return null;
    const changed = changedLines(file.rawPatch);
    const isChanged =
        side === "additions"
            ? changed.additions.has(lineNumber)
            : changed.deletions.has(lineNumber);
    return {
        text,
        lineType: isChanged
            ? side === "additions"
                ? "change-addition"
                : "change-deletion"
            : "context-expanded",
    };
}

export function stampStale(comments: CommentMap, files: ParsedFile[]): CommentMap {
    const byPath = new Map(files.map((file) => [file.path, file]));
    const result: CommentMap = {};
    for (const [filePath, list] of Object.entries(comments)) {
        const file = byPath.get(filePath);
        result[filePath] = list.map((comment) => {
            const info = file ? lineInfo(file, comment.side, comment.lineNumber) : null;
            const stale = !info || info.text !== comment.lineText;
            return stale === Boolean(comment.stale) ? comment : { ...comment, stale };
        });
    }
    return result;
}

export function createValidatedComment(
    file: ParsedFile | undefined,
    input: {
        id?: string;
        filePath: string;
        side: CommentSide;
        lineNumber: number;
        body: string;
        author: DiffComment["author"];
    },
): DiffComment {
    if (!file) throw new Error("file is not part of this diff");
    const info = lineInfo(file, input.side, input.lineNumber);
    if (!info) throw new Error("line is not present on the selected side");
    const body = input.body.trim();
    if (!body) throw new Error("comment body is required");
    return {
        id: input.id ?? crypto.randomUUID(),
        filePath: input.filePath,
        side: input.side,
        lineNumber: input.lineNumber,
        lineType: info.lineType,
        lineText: info.text,
        body,
        createdAt: Date.now(),
        author: input.author,
    };
}
