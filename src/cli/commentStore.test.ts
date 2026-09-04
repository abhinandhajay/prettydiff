import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { makeTmpDir } from "../../test/helpers/tmpRepo";

import { CommentStore } from "./commentStore";

const repoId = "0123456789ab";
const repoRoot = "/tmp/example";

function comment(id: string, body = "Review this") {
    return {
        id,
        filePath: "a.txt",
        side: "additions" as const,
        lineNumber: 1,
        lineType: "change-addition" as const,
        lineText: "two",
        body,
        createdAt: 1,
        author: { kind: "agent" as const, name: "Codex" },
    };
}

describe("CommentStore", () => {
    test("persists comments and revisions across instances", async () => {
        const dir = await makeTmpDir();
        const first = new CommentStore(dir);
        expect((await first.get(repoId, repoRoot)).revision).toBe(0);
        await first.create(repoId, repoRoot, comment("c1"));

        const second = new CommentStore(dir);
        const saved = await second.get(repoId, repoRoot);
        expect(saved.revision).toBe(1);
        expect(saved.comments["a.txt"]?.[0]?.author).toEqual({ kind: "agent", name: "Codex" });
    });

    test("merges legacy comments by id and supplies user attribution", async () => {
        const store = new CommentStore(await makeTmpDir());
        const legacy = { ...comment("legacy"), author: undefined };
        await store.import(repoId, repoRoot, { "a.txt": [legacy] });
        await store.import(repoId, repoRoot, { "a.txt": [legacy] });
        const saved = await store.get(repoId, repoRoot);
        expect(saved.comments["a.txt"]).toHaveLength(1);
        expect(saved.comments["a.txt"]?.[0]?.author).toEqual({ kind: "user" });
    });

    test("ignores imported comments with unsupported line types", async () => {
        const store = new CommentStore(await makeTmpDir());
        const malformed = { ...comment("malformed"), lineType: "unexpected" };
        await store.import(repoId, repoRoot, { "a.txt": [malformed] } as never);
        expect((await store.get(repoId, repoRoot)).comments).toEqual({});
    });

    test("serializes concurrent mutations without losing comments", async () => {
        const dir = await makeTmpDir();
        const a = new CommentStore(dir);
        const b = new CommentStore(dir);
        await Promise.all([
            a.create(repoId, repoRoot, comment("a")),
            b.create(repoId, repoRoot, comment("b")),
        ]);
        expect(Object.values((await a.get(repoId, repoRoot)).comments).flat()).toHaveLength(2);
    });

    test("rejects malformed comments before persistence", async () => {
        const store = new CommentStore(await makeTmpDir());
        await expect(
            store.create(repoId, repoRoot, { ...comment("malformed"), id: 42 } as never),
        ).rejects.toThrow("invalid comment");
        expect((await store.get(repoId, repoRoot)).comments).toEqual({});
    });

    test("refuses corrupt persisted data", async () => {
        const dir = await makeTmpDir();
        const reviews = path.join(dir, "reviews");
        await mkdir(reviews, { recursive: true });
        await writeFile(path.join(reviews, `${repoId}.json`), "not json");
        await expect(new CommentStore(dir).get(repoId, repoRoot)).rejects.toThrow(
            "cannot read stored comments",
        );
        expect(await readFile(path.join(reviews, `${repoId}.json`), "utf8")).toBe("not json");
    });

    test("refuses persisted comments with unsupported line types", async () => {
        const dir = await makeTmpDir();
        const reviews = path.join(dir, "reviews");
        await mkdir(reviews, { recursive: true });
        await writeFile(
            path.join(reviews, `${repoId}.json`),
            JSON.stringify({
                schemaVersion: 1,
                repoRoot,
                revision: 1,
                comments: { "a.txt": [{ ...comment("malformed"), lineType: "unexpected" }] },
            }),
        );
        await expect(new CommentStore(dir).get(repoId, repoRoot)).rejects.toThrow(
            "cannot read stored comments",
        );
    });
});
