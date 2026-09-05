import { describe, expect, test } from "bun:test";

import { lineInfo, stampStale } from "./review";

import type { CommentMap, ParsedFile } from "./types";

const file: ParsedFile = {
    path: "a.txt",
    status: "modified",
    additions: 1,
    deletions: 1,
    oldContents: "outside\none\ntwo\nthree\n",
    newContents: "outside\none\nchanged\nthree\n",
    rawPatch: [
        "diff --git a/a.txt b/a.txt",
        "--- a/a.txt",
        "+++ b/a.txt",
        "@@ -2,3 +2,3 @@",
        " one",
        "-two",
        "+changed",
        " three",
        "",
    ].join("\n"),
};

describe("lineInfo", () => {
    test("distinguishes changed, patch-context, and expanded-context lines", () => {
        expect(lineInfo(file, "additions", 3)).toEqual({
            text: "changed",
            lineType: "change-addition",
        });
        expect(lineInfo(file, "deletions", 3)).toEqual({
            text: "two",
            lineType: "change-deletion",
        });
        expect(lineInfo(file, "additions", 2)).toEqual({
            text: "one",
            lineType: "context",
        });
        expect(lineInfo(file, "deletions", 4)).toEqual({
            text: "three",
            lineType: "context",
        });
        expect(lineInfo(file, "additions", 1)).toEqual({
            text: "outside",
            lineType: "context-expanded",
        });
    });
});

describe("stampStale", () => {
    test("preserves comment buckets for reserved object property names", () => {
        const specialFile = { ...file, path: "__proto__" };
        const comment = {
            id: "special",
            filePath: "__proto__",
            side: "additions" as const,
            lineNumber: 3,
            lineType: "change-addition" as const,
            lineText: "changed",
            body: "Review this",
            createdAt: 1,
            author: { kind: "agent" as const },
        };
        const comments = Object.fromEntries([["__proto__", [comment]]]) as CommentMap;

        const stamped = stampStale(comments, [specialFile]);
        expect(Object.hasOwn(stamped, "__proto__")).toBe(true);
        expect(stamped["__proto__"]).toEqual([comment]);
    });
});
