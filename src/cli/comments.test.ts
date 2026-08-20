import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
    cleanupDir,
    commitFile,
    makeRepo,
    makeTmpDir,
    writeRepoFile,
} from "../../test/helpers/tmpRepo";

import {
    COMMENTS_ADD_HELP,
    COMMENTS_DELETE_HELP,
    COMMENTS_HELP,
    COMMENTS_LIST_HELP,
    COMMENTS_UPDATE_HELP,
    runCommentsCommand,
} from "./comments";
import { CommentStore } from "./commentStore";
import { canonicalRepoRoot } from "./git";
import { HubRegistry } from "./registry";
import { startServer } from "./server";

const dirs: string[] = [];
let repo: string;
let store: CommentStore;

beforeAll(async () => {
    repo = await makeRepo();
    dirs.push(repo);
    await commitFile(repo, "a.txt", "one\ntwo\nthree\n");
    await writeRepoFile(repo, "a.txt", "one\nchanged\nthree\n");
    const dataDir = await makeTmpDir();
    dirs.push(dataDir);
    store = new CommentStore(dataDir);
});

afterAll(async () => {
    await Promise.all(dirs.map(cleanupDir));
});

async function run(argv: string[]) {
    let stdout = "";
    let stderr = "";
    const code = await runCommentsCommand(argv, {
        cwd: repo,
        commentStore: store,
        stdout: (text) => (stdout += text),
        stderr: (text) => (stderr += text),
    });
    return { code, stdout, stderr };
}

describe("comments help", () => {
    test.each([
        [[], COMMENTS_HELP],
        [["list", "--help"], COMMENTS_LIST_HELP],
        [["add", "--help"], COMMENTS_ADD_HELP],
        [["update", "--help"], COMMENTS_UPDATE_HELP],
        [["delete", "--help"], COMMENTS_DELETE_HELP],
    ])("prints contextual help", async (argv, expected) => {
        expect(await run(argv as string[])).toEqual({ code: 0, stdout: expected, stderr: "" });
    });

    test("unknown commands and missing arguments are usage errors", async () => {
        expect(await run(["nope"])).toEqual({
            code: 2,
            stdout: "",
            stderr: 'prettydiff: unknown comments command: nope\nRun "prettydiff comments --help" for usage.\n',
        });
        const missing = await run(["add", "--file", "a.txt"]);
        expect(missing.code).toBe(2);
        expect(missing.stderr).toContain("--side must be additions or deletions");
    });
});

describe("comments commands", () => {
    let id: string;

    test("adds a validated agent comment and returns JSON", async () => {
        const result = await run([
            "add",
            "--file",
            "a.txt",
            "--side",
            "additions",
            "--line",
            "2",
            "--body",
            "  Check this  ",
            "--author",
            "Codex",
        ]);
        expect(result.code).toBe(0);
        const body = JSON.parse(result.stdout);
        id = body.comment.id;
        expect(body).toEqual({
            revision: 1,
            comment: expect.objectContaining({
                id,
                filePath: "a.txt",
                side: "additions",
                lineNumber: 2,
                lineType: "change-addition",
                lineText: "changed",
                body: "Check this",
                author: { kind: "agent", name: "Codex" },
            }),
        });
    });

    test("lists, updates, and deletes comments", async () => {
        const listed = JSON.parse((await run(["list"])).stdout);
        expect(listed.revision).toBe(1);
        expect(listed.comments["a.txt"][0]).toEqual(expect.objectContaining({ id }));
        expect(listed.comments["a.txt"][0].stale).toBeUndefined();

        const updated = JSON.parse(
            (await run(["update", "--id", id, "--body", "Updated body"])).stdout,
        );
        expect(updated).toEqual({
            revision: 2,
            comment: expect.objectContaining({ id, body: "Updated body" }),
        });

        const deleted = JSON.parse((await run(["delete", "--id", id])).stdout);
        expect(deleted).toEqual({ revision: 3, deletedId: id });
        expect(JSON.parse((await run(["list"])).stdout).comments).toEqual({});
    });

    test("rejects lines outside the selected diff", async () => {
        const result = await run([
            "add",
            "--file",
            "missing.txt",
            "--side",
            "additions",
            "--line",
            "1",
            "--body",
            "Nope",
        ]);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("file is not part of this diff");
    });

    test("stamps comments stale after the selected line changes", async () => {
        const added = JSON.parse(
            (
                await run([
                    "add",
                    "--file",
                    "a.txt",
                    "--side",
                    "additions",
                    "--line",
                    "2",
                    "--body",
                    "Will become stale",
                ])
            ).stdout,
        );
        await writeRepoFile(repo, "a.txt", "one\nchanged again\nthree\n");
        const listed = JSON.parse((await run(["list"])).stdout);
        expect(
            listed.comments["a.txt"].find((item: { id: string }) => item.id === added.comment.id)
                .stale,
        ).toBe(true);
    });

    test("supports a committed branch target without working-tree changes", async () => {
        const branchRepo = await makeRepo();
        const dataDir = await makeTmpDir();
        dirs.push(branchRepo, dataDir);
        await commitFile(branchRepo, "branch.txt", "base\n");
        await (
            await import("../../test/helpers/tmpRepo")
        ).runGit(branchRepo, "switch", "-c", "feature");
        await commitFile(branchRepo, "branch.txt", "base\nfeature\n", "feature change");
        let stdout = "";
        const code = await runCommentsCommand(
            [
                "add",
                "--file",
                "branch.txt",
                "--side",
                "additions",
                "--line",
                "2",
                "--body",
                "Branch comment",
                "--target",
                "branch",
                "--target-ref",
                "main",
                "--no-include-working-tree",
            ],
            {
                cwd: branchRepo,
                commentStore: new CommentStore(dataDir),
                stdout: (text) => (stdout += text),
                stderr: () => {},
            },
        );
        expect(code).toBe(0);
        expect(JSON.parse(stdout).comment.lineText).toBe("feature");
    });
});

describe("CLI and browser server sharing", () => {
    test("both surfaces read and write the same comment store", async () => {
        const sharedRepo = await makeRepo();
        const dataDir = await makeTmpDir();
        dirs.push(sharedRepo, dataDir);
        await commitFile(sharedRepo, "shared.txt", "before\n");
        await writeRepoFile(sharedRepo, "shared.txt", "after\n");

        const registry = new HubRegistry();
        registry.register((await canonicalRepoRoot(sharedRepo))!, "test-client", { isHub: true });
        const server = await startServer({
            port: 0,
            version: "0.0.0-test",
            hubId: "shared-comments-test",
            registry,
            commentStore: new CommentStore(dataDir),
        });
        try {
            let stdout = "";
            expect(
                await runCommentsCommand(
                    [
                        "add",
                        "--file",
                        "shared.txt",
                        "--side",
                        "additions",
                        "--line",
                        "1",
                        "--body",
                        "From CLI",
                        "--author",
                        "Codex",
                    ],
                    {
                        cwd: sharedRepo,
                        commentStore: new CommentStore(dataDir),
                        stdout: (text) => (stdout += text),
                        stderr: () => {},
                    },
                ),
            ).toBe(0);
            const cliComment = JSON.parse(stdout).comment;

            const browserList = await fetch(`${server.url}/api/comments`);
            expect(browserList.status).toBe(200);
            expect((await browserList.json()).comments["shared.txt"][0]).toEqual(
                expect.objectContaining({
                    id: cliComment.id,
                    author: { kind: "agent", name: "Codex" },
                }),
            );

            const browserCreate = await fetch(`${server.url}/api/comments`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    filePath: "shared.txt",
                    side: "additions",
                    lineNumber: 1,
                    body: "From browser",
                }),
            });
            expect(browserCreate.status).toBe(200);

            await writeRepoFile(sharedRepo, "shared.txt", "later\n");
            const browserUpdate = await fetch(
                `${server.url}/api/comments/${encodeURIComponent(cliComment.id)}`,
                {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ body: "Updated after the line changed" }),
                },
            );
            expect(browserUpdate.status).toBe(200);
            expect((await browserUpdate.json()).comments["shared.txt"][0]).toEqual(
                expect.objectContaining({ id: cliComment.id, stale: true }),
            );

            stdout = "";
            await runCommentsCommand(["list"], {
                cwd: sharedRepo,
                commentStore: new CommentStore(dataDir),
                stdout: (text) => (stdout += text),
                stderr: () => {},
            });
            expect(JSON.parse(stdout).comments["shared.txt"]).toEqual([
                expect.objectContaining({
                    id: cliComment.id,
                    author: { kind: "agent", name: "Codex" },
                }),
                expect.objectContaining({ body: "From browser", author: { kind: "user" } }),
            ]);
        } finally {
            await server.close();
        }
    });
});
