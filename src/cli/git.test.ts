import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, realpath, rm, symlink } from "node:fs/promises";
import path from "node:path";

import {
    cleanupDir,
    commitFile,
    makeRepo,
    makeTmpDir,
    runGit,
    writeRepoFile,
} from "../../test/helpers/tmpRepo";

import { getDiffFile, getDiffPayload, getDiffPayloadForFiles, getRepoRoot } from "./git.js";
import { createValidatedComment } from "./review.js";

import type { ParsedFile } from "./types.js";

const TIMEOUT = 15_000;

const dirs: string[] = [];

async function trackedRepo(): Promise<string> {
    const dir = await makeRepo();
    dirs.push(dir);
    return dir;
}

afterAll(async () => {
    await Promise.all(dirs.map((d) => cleanupDir(d)));
});

function fileByPath(files: ParsedFile[], p: string): ParsedFile {
    const file = files.find((f) => f.path === p);
    if (!file) throw new Error(`file ${p} not in payload: ${files.map((f) => f.path).join(", ")}`);
    return file;
}

describe("getRepoRoot", () => {
    let repo: string;
    let repoReal: string;

    beforeAll(async () => {
        repo = await trackedRepo();
        await commitFile(repo, "a.txt", "hello\n");
        repoReal = await realpath(repo);
    });

    test(
        "returns the repo root",
        async () => {
            expect(await getRepoRoot(repo)).toBe(repoReal);
        },
        TIMEOUT,
    );

    test(
        "returns the root from a subdirectory",
        async () => {
            const sub = path.join(repo, "nested", "deeper");
            await mkdir(sub, { recursive: true });
            expect(await getRepoRoot(sub)).toBe(repoReal);
        },
        TIMEOUT,
    );

    test(
        "returns null outside a repo",
        async () => {
            const dir = await makeTmpDir();
            dirs.push(dir);
            expect(await getRepoRoot(dir)).toBeNull();
        },
        TIMEOUT,
    );
});

describe("Git-quoted paths", () => {
    const names = [
        "café.txt",
        "tab\tname.txt",
        'quote".txt',
        "back\\slash.txt",
        "line\nname.txt",
        "control\x07\b\f\r\v.txt",
        "apostrophe'.txt",
        "trailing space ",
        'ends"',
        "ends'",
        "literal\\303.txt",
    ];

    test(
        "quoted paths survive no-hunk, binary, added, deleted, and committed diffs",
        async () => {
            const repo = await trackedRepo();
            const name = 'café\t"\\.txt';
            await commitFile(repo, name, "old\n");
            await runGit(repo, "mv", "--", name, `renamed-${name}`);
            expect(await getDiffFile(repo, `renamed-${name}`)).toMatchObject({
                oldPath: name,
                status: "renamed",
                skipped: { reason: "no-hunks" },
            });
            await runGit(repo, "commit", "-am", "rename");
            await runGit(repo, "rm", "--", `renamed-${name}`);
            expect(await getDiffFile(repo, `renamed-${name}`)).toMatchObject({
                status: "deleted",
                oldContents: "old\n",
                newContents: "",
            });
            await writeRepoFile(repo, name, "new\n");
            await runGit(repo, "add", "--", name);
            expect(await getDiffFile(repo, name)).toMatchObject({
                status: "added",
                newContents: "new\n",
            });
            await runGit(repo, "commit", "-am", "replace");
            expect(
                await getDiffFile(repo, name, {
                    target: "branch",
                    targetRef: "HEAD~1",
                    includeWorkingTree: false,
                }),
            ).toMatchObject({ path: name, newContents: "new\n" });
            await writeRepoFile(repo, name, new Uint8Array([0, 1, 2]));
            expect(await getDiffFile(repo, name)).toMatchObject({ path: name, binary: true });
            await runGit(repo, "config", "core.quotePath", "false");
            expect(await getDiffFile(repo, name)).toMatchObject({ path: name, binary: true });
        },
        TIMEOUT,
    );

    for (const name of names) {
        test(
            `round-trips ${JSON.stringify(name)} through tracked, untracked, and rename lookups`,
            async () => {
                const repo = await trackedRepo();
                await runGit(repo, "config", "core.quotePath", "true");
                await commitFile(repo, name, "one\ntwo\nthree\nfour\nfive\n");
                await writeRepoFile(repo, name, "one\nchanged\nthree\nfour\nfive\n");
                const file = fileByPath((await getDiffPayload(repo))!.files, name);
                expect(file.status).toBe("modified");
                expect(file.oldContents).toBe("one\ntwo\nthree\nfour\nfive\n");
                expect(file.newContents).toBe("one\nchanged\nthree\nfour\nfive\n");
                expect(await getDiffFile(repo, name)).toEqual(file);

                const renamed = `new-${name}`;
                await runGit(repo, "mv", "--", name, renamed);
                const rename = await getDiffFile(repo, renamed);
                expect(rename).toMatchObject({
                    path: renamed,
                    oldPath: name,
                    status: "renamed",
                    oldContents: file.oldContents,
                    newContents: file.newContents,
                });
                expect((await getDiffPayloadForFiles(repo, [name]))!.files).toEqual([rename!]);
                const comment = createValidatedComment(rename, {
                    filePath: renamed,
                    side: "deletions",
                    lineNumber: 2,
                    body: "review",
                    author: { kind: "agent" },
                });
                expect(comment.lineText).toBe("two");

                const untrackedName = `untracked-${name}`;
                await writeRepoFile(repo, untrackedName, "untracked\n");
                expect(await getDiffFile(repo, untrackedName)).toMatchObject({
                    path: untrackedName,
                    status: "untracked",
                    oldContents: "",
                    newContents: "untracked\n",
                });
                await writeRepoFile(repo, untrackedName, "x".repeat(513 * 1024));
                expect(await getDiffFile(repo, untrackedName)).toMatchObject({
                    path: untrackedName,
                    status: "untracked",
                    skipped: { reason: "too-large" },
                });
            },
            TIMEOUT,
        );
    }
});

describe("getDiffPayload — working tree", () => {
    test(
        "clean repo produces an empty payload with repo metadata",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "hello\n");
            const payload = await getDiffPayload(repo);
            if (!payload) throw new Error("payload was null");
            expect(payload.files).toEqual([]);
            expect(payload.branch).toBe("main");
            expect(payload.head).toMatch(/^[0-9a-f]{7,}$/);
            expect(payload.target).toBe("working-tree");
            expect(payload.targetRef).toBeUndefined();
            expect(payload.mergeBase).toBeUndefined();
            expect(payload.includeWorkingTree).toBeUndefined();
            expect(Number.isNaN(Date.parse(payload.generatedAt))).toBe(false);
            expect(payload.branches).toEqual([{ name: "main", current: true }]);
        },
        TIMEOUT,
    );

    test(
        "returns null for a non-repo directory",
        async () => {
            const dir = await makeTmpDir();
            dirs.push(dir);
            expect(await getDiffPayload(dir)).toBeNull();
        },
        TIMEOUT,
    );

    test(
        "modified file",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "one\ntwo\nthree\n");
            await writeRepoFile(repo, "a.txt", "one\n2\nthree\nfour\n");
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "a.txt");
            expect(file.status).toBe("modified");
            expect(file.additions).toBe(2);
            expect(file.deletions).toBe(1);
            expect(file.rawPatch.startsWith("diff --git")).toBe(true);
            expect(file.oldContents).toBe("one\ntwo\nthree\n");
            expect(file.newContents).toBe("one\n2\nthree\nfour\n");
        },
        TIMEOUT,
    );

    test(
        "can limit tracked and untracked work to selected files",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "a\n");
            await commitFile(repo, "b.txt", "b\n");
            await writeRepoFile(repo, "a.txt", "changed a\n");
            await writeRepoFile(repo, "b.txt", "changed b\n");
            await writeRepoFile(repo, "note.txt", "note\n");

            expect(
                (await getDiffPayloadForFiles(repo, ["a.txt"]))!.files.map((f) => f.path),
            ).toEqual(["a.txt"]);
            expect(
                (await getDiffPayloadForFiles(repo, ["note.txt"]))!.files.map((f) => f.path),
            ).toEqual(["note.txt"]);
            expect((await getDiffPayloadForFiles(repo, []))!.files).toEqual([]);
        },
        TIMEOUT,
    );

    test(
        "loads one review file without building repository metadata",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "before\n");
            await writeRepoFile(repo, "a.txt", "after\n");

            const file = await getDiffFile(repo, "a.txt");
            expect(file).toEqual(
                expect.objectContaining({
                    path: "a.txt",
                    oldContents: "before\n",
                    newContents: "after\n",
                }),
            );
            expect(await getDiffFile(repo, "missing.txt")).toBeUndefined();
        },
        TIMEOUT,
    );

    test(
        "preserves both sides when filtering renamed review files",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "old.txt", "line1\nline2\nline3\nline4\n");
            await runGit(repo, "mv", "old.txt", "new.txt");
            await writeRepoFile(repo, "new.txt", "line1\nchanged\nline3\nline4\n");

            const singleFile = await getDiffFile(repo, "new.txt");
            const batchedFile = fileByPath(
                (await getDiffPayloadForFiles(repo, ["new.txt"]))!.files,
                "new.txt",
            );
            for (const file of [singleFile, batchedFile]) {
                expect(file).toEqual(
                    expect.objectContaining({
                        path: "new.txt",
                        oldPath: "old.txt",
                        status: "renamed",
                        oldContents: "line1\nline2\nline3\nline4\n",
                        newContents: "line1\nchanged\nline3\nline4\n",
                    }),
                );
                expect(file!.rawPatch).toContain("-line2");
                expect(file!.rawPatch).toContain("+changed");
            }
        },
        TIMEOUT,
    );

    test(
        "staged new file is added",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "hello\n");
            await writeRepoFile(repo, "b.txt", "new file\n");
            await runGit(repo, "add", "b.txt");
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "b.txt");
            expect(file.status).toBe("added");
            expect(file.oldContents).toBe("");
            expect(file.newContents).toBe("new file\n");
        },
        TIMEOUT,
    );

    test(
        "deleted file",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "gone\n");
            await rm(path.join(repo, "a.txt"));
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "a.txt");
            expect(file.status).toBe("deleted");
            expect(file.oldContents).toBe("gone\n");
            expect(file.newContents).toBe("");
        },
        TIMEOUT,
    );

    test(
        "renamed file with an edit keeps old and new paths",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "old.txt", "line1\nline2\nline3\nline4\n");
            await runGit(repo, "mv", "old.txt", "new.txt");
            await writeRepoFile(repo, "new.txt", "line1\nline2\nline3\nline4\nline5\n");
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "new.txt");
            expect(file.status).toBe("renamed");
            expect(file.oldPath).toBe("old.txt");
            expect(file.skipped).toBeUndefined();
            expect(file.rawPatch).toContain("+line5");
        },
        TIMEOUT,
    );

    test(
        "pure rename has no hunks and is skipped",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "old.txt", "same\n");
            await runGit(repo, "mv", "old.txt", "new.txt");
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "new.txt");
            expect(file.status).toBe("renamed");
            expect(file.oldPath).toBe("old.txt");
            expect(file.skipped).toEqual({ reason: "no-hunks" });
            expect(file.rawPatch).toBe("");
        },
        TIMEOUT,
    );

    test(
        "untracked text file gets a synthesized patch",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "hello\n");
            await writeRepoFile(repo, "notes.txt", "remember\n");
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "notes.txt");
            expect(file.status).toBe("untracked");
            expect(file.additions).toBe(1);
            expect(file.rawPatch).toContain("diff --git a/notes.txt b/notes.txt");
            expect(file.rawPatch).toContain("+remember");
            expect(file.oldContents).toBe("");
            expect(file.newContents).toBe("remember\n");
        },
        TIMEOUT,
    );

    test(
        "empty untracked file is included as no-hunks",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "hello\n");
            await writeRepoFile(repo, "empty.txt", "");
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "empty.txt");
            expect(file.status).toBe("untracked");
            expect(file.skipped).toEqual({ reason: "no-hunks" });
            expect(file.rawPatch).toBe("");
        },
        TIMEOUT,
    );

    test(
        "untracked binary file is skipped as binary",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "hello\n");
            await writeRepoFile(repo, "blob.bin", Uint8Array.from([0, 1, 2, 255, 0, 7]));
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "blob.bin");
            expect(file.status).toBe("untracked");
            expect(file.binary).toBe(true);
            expect(file.skipped).toEqual({ reason: "binary" });
            expect(file.rawPatch).toBe("");
        },
        TIMEOUT,
    );

    test(
        "oversized untracked file is skipped as too-large",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "hello\n");
            await writeRepoFile(repo, "big.txt", "x".repeat(513 * 1024));
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "big.txt");
            expect(file.status).toBe("untracked");
            expect(file.binary).toBeUndefined();
            expect(file.skipped).toEqual({ reason: "too-large" });
            expect(file.rawPatch).toBe("");
        },
        TIMEOUT,
    );

    test(
        "oversized tracked file is skipped as too-large",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "big.txt", "small\n");
            await writeRepoFile(repo, "big.txt", `${"y".repeat(513 * 1024)}\n`);
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "big.txt");
            expect(file.status).toBe("modified");
            expect(file.skipped).toEqual({ reason: "too-large" });
            expect(file.rawPatch).toBe("");
            expect(file.oldContents).toBeUndefined();
            expect(file.newContents).toBeUndefined();
        },
        TIMEOUT,
    );

    test(
        "CRLF line endings never leak into contents",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "alpha\nbeta\n");
            await writeRepoFile(repo, "a.txt", "alpha\r\nbeta\r\ngamma\r\n");
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "a.txt");
            expect(file.newContents).toBe("alpha\nbeta\ngamma\n");
            expect(file.rawPatch).not.toContain("\r");
        },
        TIMEOUT,
    );

    test(
        "re-pointed symlink reports the link target as contents",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "target-a.txt", "a\n");
            await commitFile(repo, "target-b.txt", "b\n");
            await symlink("target-a.txt", path.join(repo, "link"));
            await runGit(repo, "add", "link");
            await runGit(repo, "commit", "-m", "add link");
            await rm(path.join(repo, "link"));
            await symlink("target-b.txt", path.join(repo, "link"));
            const payload = await getDiffPayload(repo);
            const file = fileByPath(payload!.files, "link");
            expect(file.status).toBe("modified");
            expect(file.oldContents).toBe("target-a.txt");
            expect(file.newContents).toBe("target-b.txt");
        },
        TIMEOUT,
    );
});

describe("getDiffPayload — branch mode", () => {
    let repo: string;
    let shaA: string;

    beforeAll(async () => {
        repo = await trackedRepo();
        await commitFile(repo, "base.txt", "base\n", "A");
        shaA = await runGit(repo, "rev-parse", "HEAD");
        await commitFile(repo, "main-only.txt", "main\n", "B");
        await runGit(repo, "checkout", "-q", "-b", "feature", shaA);
        await commitFile(repo, "feature.txt", "feat\n", "C");
        await writeRepoFile(repo, "base.txt", "base\nedited\n");
        await writeRepoFile(repo, "note.txt", "note\n");
    });

    test(
        "diffs against the merge base and includes working tree by default",
        async () => {
            const payload = await getDiffPayload(repo, {
                target: "branch",
                targetRef: "main",
            });
            if (!payload) throw new Error("payload was null");
            expect(payload.target).toBe("branch");
            expect(payload.targetRef).toBe("main");
            expect(payload.mergeBase).toBe(shaA);
            expect(payload.includeWorkingTree).toBe(true);
            const paths = payload.files.map((f) => f.path).sort();
            expect(paths).toEqual(["base.txt", "feature.txt", "note.txt"]);
            expect(fileByPath(payload.files, "note.txt").status).toBe("untracked");
        },
        TIMEOUT,
    );

    test(
        "includeWorkingTree: false only diffs committed changes",
        async () => {
            const payload = await getDiffPayload(repo, {
                target: "branch",
                targetRef: "main",
                includeWorkingTree: false,
            });
            if (!payload) throw new Error("payload was null");
            expect(payload.includeWorkingTree).toBe(false);
            expect(payload.files.map((f) => f.path)).toEqual(["feature.txt"]);
        },
        TIMEOUT,
    );

    test(
        "invalid targetRef falls back to the current branch",
        async () => {
            const payload = await getDiffPayload(repo, {
                target: "branch",
                targetRef: "does-not-exist",
            });
            expect(payload!.targetRef).toBe("feature");
        },
        TIMEOUT,
    );

    test(
        "detached HEAD reports branch as HEAD with no current branch",
        async () => {
            const detached = await trackedRepo();
            await commitFile(detached, "a.txt", "hello\n");
            await runGit(detached, "checkout", "-q", "--detach");
            const payload = await getDiffPayload(detached);
            expect(payload!.branch).toBe("HEAD");
            expect(payload!.branches.every((b) => !b.current)).toBe(true);
        },
        TIMEOUT,
    );

    test(
        "unrelated histories produce a payload without a merge base",
        async () => {
            const orphaned = await trackedRepo();
            await commitFile(orphaned, "a.txt", "a\n");
            await runGit(orphaned, "checkout", "-q", "--orphan", "orphan");
            await runGit(orphaned, "commit", "-m", "orphan root");
            const payload = await getDiffPayload(orphaned, {
                target: "branch",
                targetRef: "main",
            });
            if (!payload) throw new Error("payload was null");
            expect(payload.targetRef).toBe("main");
            expect(payload.mergeBase).toBeUndefined();
        },
        TIMEOUT,
    );
});

describe("branches list", () => {
    test(
        "lists all branches sorted with exactly one current",
        async () => {
            const repo = await trackedRepo();
            await commitFile(repo, "a.txt", "hello\n");
            await runGit(repo, "branch", "zeta");
            await runGit(repo, "branch", "alpha");
            const payload = await getDiffPayload(repo);
            expect(payload!.branches).toEqual([
                { name: "alpha" },
                { name: "main", current: true },
                { name: "zeta" },
            ]);
        },
        TIMEOUT,
    );
});
