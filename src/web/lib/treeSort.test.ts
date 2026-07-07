import { describe, expect, it } from "bun:test";

import { compareTreePath, sortFilesForTree } from "@/lib/treeSort";

import type { ParsedFile } from "@/lib/types";

function file(path: string): ParsedFile {
    return { path, status: "modified", additions: 0, deletions: 0, rawPatch: "" };
}

describe("compareTreePath", () => {
    it("sorts folders before files at the same level", () => {
        expect(compareTreePath("src/x.ts", "top.ts")).toBeLessThan(0);
        expect(compareTreePath("top.ts", "src/x.ts")).toBeGreaterThan(0);
    });

    it("compares case-insensitively", () => {
        expect(compareTreePath("a.ts", "B.ts")).toBeLessThan(0);
        expect(compareTreePath("B.ts", "a.ts")).toBeGreaterThan(0);
    });

    it("compares numerically", () => {
        expect(compareTreePath("file2.ts", "file10.ts")).toBeLessThan(0);
    });

    it("puts shorter paths first when one is a prefix of the other", () => {
        expect(compareTreePath("a/b", "a/b/c")).toBeLessThan(0);
    });

    it("treats equal paths as equal", () => {
        expect(compareTreePath("a/b.ts", "a/b.ts")).toBe(0);
    });
});

describe("sortFilesForTree", () => {
    it("returns a new sorted array without mutating the input", () => {
        const files = [file("src/z.ts"), file("a.ts"), file("src/a.ts")];
        const sorted = sortFilesForTree(files);
        expect(sorted).not.toBe(files);
        expect(sorted.map((f) => f.path)).toEqual(["src/a.ts", "src/z.ts", "a.ts"]);
        expect(files.map((f) => f.path)).toEqual(["src/z.ts", "a.ts", "src/a.ts"]);
    });
});
