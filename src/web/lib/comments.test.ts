import { describe, expect, it } from "bun:test";

import {
    allCommentIds,
    buildFileIndex,
    commentKey,
    commentsByKey,
    formatCommentsForCopy,
    markStaleComments,
    type PatchLineIndex,
} from "@/lib/comments";

import type { CommentMap, DiffComment, ParsedFile } from "@/lib/types";

const modified: ParsedFile = {
    path: "x.ts",
    status: "modified",
    additions: 1,
    deletions: 1,
    rawPatch: "@@ -1,3 +1,3 @@\n a\n-b\n+B-changed\n c\n",
    oldContents: "a\nb\nc\nd\ne\n",
    newContents: "a\nB-changed\nc\nd\ne\n",
};

function makeComment(overrides: Partial<DiffComment> = {}): DiffComment {
    return {
        id: "c1",
        filePath: "x.ts",
        side: "additions",
        lineNumber: 2,
        lineType: "change-addition",
        lineText: "B-changed",
        body: "note",
        createdAt: 0,
        ...overrides,
    };
}

describe("buildFileIndex", () => {
    const idx = buildFileIndex(modified);

    it("indexes every line of the full file, not just the patch", () => {
        expect(idx.additions.size).toBe(5);
        expect(idx.deletions.size).toBe(5);
        expect(idx.additions.get(5)).toBe("e");
        expect(idx.deletions.get(4)).toBe("d");
    });

    it("marks only genuine changes via the patch scan", () => {
        expect([...idx.changedAdditions]).toEqual([2]);
        expect([...idx.changedDeletions]).toEqual([2]);
    });

    it("tracks which lines fell inside the original patch hunks", () => {
        // hunk @@ -1,3 +1,3 @@ covers lines 1..3 on both sides.
        expect([...idx.patchAdditions].sort((a, b) => a - b)).toEqual([1, 2, 3]);
        expect(idx.patchAdditions.has(5)).toBe(false);
        expect(idx.patchDeletions.has(4)).toBe(false);
    });
    it("handles files without a trailing newline", () => {
        const idx2 = buildFileIndex({ ...modified, newContents: "a\nb" });
        expect(idx2.additions.size).toBe(2);
        expect(idx2.additions.get(2)).toBe("b");
    });

    it("indexes empty contents as a single empty line", () => {
        const idx2 = buildFileIndex({ ...modified, oldContents: "" });
        expect(idx2.deletions.size).toBe(1);
        expect(idx2.deletions.get(1)).toBe("");
    });

    it("skips no-newline markers without breaking line counters", () => {
        const idx2 = buildFileIndex({
            ...modified,
            rawPatch:
                "@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+B\n\\ No newline at end of file\n",
            oldContents: "a\nb",
            newContents: "a\nB",
        });
        expect([...idx2.changedAdditions]).toEqual([2]);
        expect([...idx2.changedDeletions]).toEqual([2]);
    });
});

describe("commentKey", () => {
    it("composes path, side, and line number", () => {
        expect(commentKey({ filePath: "x.ts", side: "additions", lineNumber: 2 })).toBe(
            "x.ts::additions::2",
        );
    });

    it("distinguishes sides and lines", () => {
        const a = commentKey({ filePath: "x.ts", side: "additions", lineNumber: 2 });
        const b = commentKey({ filePath: "x.ts", side: "deletions", lineNumber: 2 });
        const c = commentKey({ filePath: "x.ts", side: "additions", lineNumber: 3 });
        expect(new Set([a, b, c]).size).toBe(3);
    });
});

describe("commentsByKey", () => {
    it("groups comments on the same line preserving order", () => {
        const first = makeComment({ id: "c1" });
        const second = makeComment({ id: "c2" });
        const other = makeComment({ id: "c3", lineNumber: 4 });
        const map = commentsByKey([first, second, other]);
        expect(map.size).toBe(2);
        expect(map.get(commentKey(first))!.map((c) => c.id)).toEqual(["c1", "c2"]);
        expect(map.get(commentKey(other))!.map((c) => c.id)).toEqual(["c3"]);
    });
});

describe("allCommentIds", () => {
    const comments: CommentMap = {
        "x.ts": [makeComment({ id: "c1" }), makeComment({ id: "c2", stale: true })],
        "y.ts": [makeComment({ id: "c3", filePath: "y.ts" })],
    };

    it("skips stale comments by default", () => {
        expect(allCommentIds(comments).sort()).toEqual(["c1", "c3"]);
    });

    it("includes stale comments when asked", () => {
        expect(allCommentIds(comments, true).sort()).toEqual(["c1", "c2", "c3"]);
    });
});

describe("markStaleComments", () => {
    it("returns the same reference when nothing changed", () => {
        const comments: CommentMap = { "x.ts": [makeComment()] };
        const result = markStaleComments(comments, [modified]);
        expect(result).toBe(comments);
        expect(result["x.ts"]).toBe(comments["x.ts"]);
    });

    it("marks comments stale when their file disappears", () => {
        const comments: CommentMap = { "gone.ts": [makeComment({ filePath: "gone.ts" })] };
        const result = markStaleComments(comments, [modified]);
        expect(result).not.toBe(comments);
        expect(result["gone.ts"]![0]!.stale).toBe(true);
    });

    it("keeps identity when a missing file's comments are already stale", () => {
        const comments: CommentMap = {
            "gone.ts": [makeComment({ filePath: "gone.ts", stale: true })],
        };
        expect(markStaleComments(comments, [])).toBe(comments);
    });

    it("marks comments stale when the line text drifts", () => {
        const comments: CommentMap = { "x.ts": [makeComment({ lineText: "old text" })] };
        const result = markStaleComments(comments, [modified]);
        expect(result["x.ts"]![0]!.stale).toBe(true);
    });

    it("revives stale comments whose line text matches again", () => {
        const comments: CommentMap = { "x.ts": [makeComment({ stale: true })] };
        const result = markStaleComments(comments, [modified]);
        expect(result["x.ts"]![0]!.stale).toBe(false);
    });

    it("prefers a supplied index over rebuilding", () => {
        const doctored: PatchLineIndex = {
            additions: new Map([[2, "doctored"]]),
            deletions: new Map(),
            changedAdditions: new Set(),
            changedDeletions: new Set(),
            patchAdditions: new Set(),
            patchDeletions: new Set(),
        };
        const comments: CommentMap = { "x.ts": [makeComment({ lineText: "doctored" })] };
        const result = markStaleComments(comments, [modified], new Map([["x.ts", doctored]]));
        expect(result).toBe(comments);
    });
});

describe("formatCommentsForCopy", () => {
    const payload = { repoRoot: "/Users/x/repo", branch: "main", head: "abc1234def" };

    it("reports when nothing is selected", () => {
        const text = formatCommentsForCopy(new Set(), {}, payload);
        expect(text).toContain("_No comments selected._");
        expect(text).toContain("Repo: repo · Branch: main · HEAD: abc1234");
    });

    it("sorts comments by line number within a file", () => {
        const comments: CommentMap = {
            "x.ts": [
                makeComment({ id: "c1", lineNumber: 9, lineText: "later" }),
                makeComment({ id: "c2", lineNumber: 3, lineText: "earlier" }),
            ],
        };
        const text = formatCommentsForCopy(new Set(["c1", "c2"]), comments, payload);
        expect(text.indexOf("### Line 3")).toBeLessThan(text.indexOf("### Line 9"));
    });

    it("excludes stale comments even when selected", () => {
        const comments: CommentMap = {
            "x.ts": [makeComment({ id: "c1", stale: true })],
        };
        const text = formatCommentsForCopy(new Set(["c1"]), comments, payload);
        expect(text).toContain("_No comments selected._");
    });

    it("fences the line with the language from the extension", () => {
        const comments: CommentMap = { "x.ts": [makeComment()] };
        expect(formatCommentsForCopy(new Set(["c1"]), comments, payload)).toContain(
            "```ts\nB-changed\n```",
        );
    });

    it("uses a bare fence for unknown extensions", () => {
        const comments: CommentMap = {
            "notes.xyz": [makeComment({ filePath: "notes.xyz" })],
        };
        expect(formatCommentsForCopy(new Set(["c1"]), comments, payload)).toContain(
            "```\nB-changed\n```",
        );
    });

    it("blockquotes each body line", () => {
        const comments: CommentMap = {
            "x.ts": [makeComment({ body: "first line\nsecond line" })],
        };
        const text = formatCommentsForCopy(new Set(["c1"]), comments, payload);
        expect(text).toContain("> first line\n> second line");
    });

    it("labels lines by their type and side", () => {
        const comments: CommentMap = {
            "x.ts": [
                makeComment({ id: "c1", lineNumber: 1, lineType: "change-addition" }),
                makeComment({ id: "c2", lineNumber: 2, lineType: "change-deletion" }),
                makeComment({ id: "c3", lineNumber: 3, lineType: "context", side: "deletions" }),
                makeComment({ id: "c4", lineNumber: 4, lineType: "context", side: "additions" }),
            ],
        };
        const text = formatCommentsForCopy(new Set(["c1", "c2", "c3", "c4"]), comments, payload);
        expect(text).toContain("### Line 1 (added)");
        expect(text).toContain("### Line 2 (deleted)");
        expect(text).toContain("### Line 3 (context (old))");
        expect(text).toContain("### Line 4 (context)");
    });
});
