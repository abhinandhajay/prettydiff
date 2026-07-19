import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
    cleanupDir,
    commitFile,
    makeRepo,
    makeTmpDir,
    writeRepoFile,
} from "../../test/helpers/tmpRepo";

import { CommentStore } from "./commentStore";
import { HubRegistry, repoIdFor } from "./registry";
import { startServer, type StartedServer } from "./server";

describe("prettydiff MCP endpoint", () => {
    let repo: string;
    let dataDir: string;
    let server: StartedServer;
    let client: Client;

    beforeAll(async () => {
        repo = await makeRepo();
        dataDir = await makeTmpDir();
        await commitFile(repo, "a.txt", "one\ntwo\n");
        await writeRepoFile(repo, "a.txt", "one\nchanged\n");
        const registry = new HubRegistry();
        registry.register(repo, "test", { isHub: true });
        server = await startServer({
            port: 0,
            version: "test",
            hubId: "test-hub",
            registry,
            commentStore: new CommentStore(dataDir),
        });
        client = new Client({ name: "test-client", version: "1" });
        await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
    });

    afterAll(async () => {
        await server.close();
        await Promise.all([cleanupDir(repo), cleanupDir(dataDir)]);
    });

    const call = async (name: string, args: Record<string, unknown> = {}) => {
        const response = await client.callTool({ name, arguments: args });
        expect(response.isError).not.toBe(true);
        return response.structuredContent as Record<string, unknown>;
    };

    test("discovers every review tool", async () => {
        const names = (await client.listTools()).tools.map((tool) => tool.name);
        expect(names).toEqual(
            expect.arrayContaining([
                "list_repositories",
                "get_review_summary",
                "get_file_diff",
                "list_repository_files",
                "read_repository_file",
                "list_comments",
                "create_comment",
                "update_comment",
                "delete_comment",
            ]),
        );
    });

    test("reads repository and diff context incrementally", async () => {
        const repos = await call("list_repositories");
        expect(repos.repositories).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: repoIdFor(repo) })]),
        );
        const summary = await call("get_review_summary");
        expect(summary.files).toEqual([
            expect.objectContaining({ path: "a.txt", status: "modified" }),
        ]);
        const diff = await call("get_file_diff", { filePath: "a.txt", includeContents: true });
        expect(diff.rawPatch).toContain("+changed");
        expect(diff.newContents).toBe("one\nchanged\n");
        expect((await call("list_repository_files")).files).toContain("a.txt");
        expect((await call("read_repository_file", { filePath: "a.txt", startLine: 2 })).text).toBe(
            "changed\n",
        );
    });

    test("creates, updates, lists, and deletes an attributed comment", async () => {
        const created = await call("create_comment", {
            filePath: "a.txt",
            side: "additions",
            lineNumber: 2,
            body: "Please cover this case",
            authorName: "Test Agent",
        });
        const id = (created.comment as { id: string }).id;
        const listed = await call("list_comments");
        expect(listed.comments).toEqual({
            "a.txt": [
                expect.objectContaining({ id, author: { kind: "agent", name: "Test Agent" } }),
            ],
        });
        const api = (await (await fetch(`${server.url}/api/comments`)).json()) as {
            comments: unknown;
        };
        expect(api.comments).toEqual(listed.comments);
        await call("update_comment", { commentId: id, body: "Updated" });
        expect(JSON.stringify((await call("list_comments")).comments)).toContain("Updated");
        await call("delete_comment", { commentId: id });
        expect((await call("list_comments")).comments).toEqual({});
    });

    test("shares REST comment mutations with MCP and supports ETags", async () => {
        const create = await fetch(`${server.url}/api/comments`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                filePath: "a.txt",
                side: "additions",
                lineNumber: 2,
                body: "Browser note",
            }),
        });
        expect(create.status).toBe(200);
        const created = (await create.json()) as { comment: { id: string; author: unknown } };
        expect(created.comment.author).toEqual({ kind: "user" });

        const first = await fetch(`${server.url}/api/comments`);
        const etag = first.headers.get("etag");
        expect(etag).toBeTruthy();
        expect(
            (await fetch(`${server.url}/api/comments`, { headers: { "if-none-match": etag! } }))
                .status,
        ).toBe(304);
        await writeRepoFile(repo, "a.txt", "one\ndrifted\n");
        const drifted = await fetch(`${server.url}/api/comments`, {
            headers: { "if-none-match": etag! },
        });
        expect(drifted.status).toBe(200);
        expect(JSON.stringify((await drifted.json()).comments)).toContain('"stale":true');
        expect(JSON.stringify((await call("list_comments")).comments)).toContain("Browser note");

        expect(
            (
                await fetch(`${server.url}/api/comments/${created.comment.id}`, {
                    method: "DELETE",
                    headers: { "content-type": "application/json" },
                    body: "{}",
                })
            ).status,
        ).toBe(200);
    });

    test("rejects repository escapes", async () => {
        const response = await client.callTool({
            name: "read_repository_file",
            arguments: { filePath: "../outside.txt" },
        });
        expect(response.isError).toBe(true);
    });

    test("rejects non-local MCP Host headers", async () => {
        const response = await fetch(`${server.url}/mcp`, {
            method: "POST",
            headers: { host: "evil.example.com", "content-type": "application/json" },
            body: "{}",
        });
        expect(response.status).toBe(403);
    });
});
