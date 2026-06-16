import { describe, expect, it } from "bun:test";

import { buildContentsIndex, buildFileIndex, buildPatchIndex } from "@/lib/comments";

import type { ParsedFile } from "@/lib/types";

const modified: ParsedFile = {
    path: "x.ts",
    status: "modified",
    additions: 1,
    deletions: 1,
    rawPatch: "@@ -1,3 +1,3 @@\n a\n-b\n+B-changed\n c\n",
    oldContents: "a\nb\nc\nd\ne\n",
    newContents: "a\nB-changed\nc\nd\ne\n",
};

describe("buildContentsIndex", () => {
    const idx = buildContentsIndex(modified);

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
});

describe("buildFileIndex", () => {
    it("uses full contents when present", () => {
        expect(buildFileIndex(modified).additions.size).toBe(5);
    });

    it("falls back to the patch when contents are absent", () => {
        const patchOnly: ParsedFile = {
            path: "y.ts",
            status: "modified",
            additions: 1,
            deletions: 1,
            rawPatch: "@@ -1,3 +1,3 @@\n a\n-b\n+B-changed\n c\n",
        };
        const idx = buildFileIndex(patchOnly);
        // only the patch's three lines are known
        expect(idx.additions.size).toBe(3);
        expect(buildPatchIndex(patchOnly.rawPatch).additions.size).toBe(3);
    });
});
