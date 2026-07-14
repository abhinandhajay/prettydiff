import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
    cleanupDir,
    commitFile,
    makeRepo,
    makeTmpDir,
    writeRepoFile,
} from "../../test/helpers/tmpRepo";
import { makeWebRoot, SPA_MARKER } from "../../test/helpers/webRoot";

import { HubRegistry, repoIdFor } from "./registry.js";
import { startServer, type StartedServer } from "./server.js";
import { makeGitRepo } from "./testUtils.js";

import type { DiffPayload, HubIdentity, HubReposResponse, RegisterResponse } from "./types.js";

const dirs: string[] = [];
let repo: string;
let webRoot: string;

beforeAll(async () => {
    repo = await makeRepo();
    dirs.push(repo);
    await commitFile(repo, "a.txt", "one\ntwo\n");
    await writeRepoFile(repo, "a.txt", "one\n2\n");
    webRoot = await makeWebRoot();
    dirs.push(webRoot);
});

afterAll(async () => {
    await Promise.all(dirs.map((d) => cleanupDir(d)));
});

function startTestServer(root: string, web?: string): Promise<StartedServer> {
    const registry = new HubRegistry();
    registry.register(root, "test-client", { isHub: true });
    // Port 0 lets the OS pick a free ephemeral port; the returned url has the real one.
    return startServer({
        port: 0,
        version: "0.0.0-test",
        hubId: "hub-test",
        registry,
        webRoot: web,
    });
}

async function withServer(
    root: string,
    fn: (srv: StartedServer) => Promise<void>,
    web?: string,
): Promise<void> {
    const srv = await startTestServer(root, web);
    try {
        await fn(srv);
    } finally {
        await srv.close();
    }
}

describe("GET /api/diff", () => {
    test("returns the diff payload", async () => {
        await withServer(repo, async (srv) => {
            const res = await fetch(`${srv.url}/api/diff`);
            expect(res.status).toBe(200);
            const payload = (await res.json()) as DiffPayload;
            expect(payload.target).toBe("working-tree");
            expect(payload.files).toHaveLength(1);
            expect(payload.files[0]!.path).toBe("a.txt");
        });
    });

    test("honors target=branch with targetRef", async () => {
        await withServer(repo, async (srv) => {
            const res = await fetch(`${srv.url}/api/diff?target=branch&targetRef=main`);
            const payload = (await res.json()) as DiffPayload;
            expect(payload.target).toBe("branch");
            expect(payload.targetRef).toBe("main");
            expect(payload.includeWorkingTree).toBe(true);
        });
    });

    test("honors includeWorkingTree=0", async () => {
        await withServer(repo, async (srv) => {
            const res = await fetch(
                `${srv.url}/api/diff?target=branch&targetRef=main&includeWorkingTree=0`,
            );
            const payload = (await res.json()) as DiffPayload;
            expect(payload.includeWorkingTree).toBe(false);
        });
    });

    test("coerces unknown targets to working-tree", async () => {
        await withServer(repo, async (srv) => {
            const res = await fetch(`${srv.url}/api/diff?target=garbage`);
            const payload = (await res.json()) as DiffPayload;
            expect(payload.target).toBe("working-tree");
        });
    });

    test("returns 500 for a non-repo root", async () => {
        const dir = await makeTmpDir();
        dirs.push(dir);
        await withServer(dir, async (srv) => {
            const res = await fetch(`${srv.url}/api/diff`);
            expect(res.status).toBe(500);
            expect(await res.json()).toEqual({ error: "not a git repository" });
        });
    });
});

describe("static serving", () => {
    test("returns 500 when the web bundle is missing", async () => {
        // Default webRoot resolves next to the source file, where no bundle exists.
        await withServer(repo, async (srv) => {
            const res = await fetch(srv.url);
            expect(res.status).toBe(500);
            expect(await res.text()).toBe("prettydiff: web bundle missing. Reinstall the package.");
        });
    });

    test("serves index.html for / and client routes", async () => {
        await withServer(
            repo,
            async (srv) => {
                for (const route of ["/", "/some/client/route"]) {
                    const res = await fetch(srv.url + route);
                    expect(res.status).toBe(200);
                    expect(await res.text()).toContain(SPA_MARKER);
                }
            },
            webRoot,
        );
    });

    test("serves bundle assets", async () => {
        await withServer(
            repo,
            async (srv) => {
                const res = await fetch(`${srv.url}/assets/app.js`);
                expect(res.status).toBe(200);
                expect(res.headers.get("content-type")).toContain("javascript");
            },
            webRoot,
        );
    });
});

describe("close", () => {
    test("stops accepting connections", async () => {
        const srv = await startTestServer(repo);
        await srv.close();
        await expect(fetch(`${srv.url}/api/diff`)).rejects.toThrow();
    });
});

describe("hub server", () => {
    let hubRoot: string;
    let otherRoot: string;
    let plainDir: string;
    let server: StartedServer;
    let base: string;
    const cleanup: string[] = [];

    beforeAll(async () => {
        hubRoot = await makeGitRepo();
        otherRoot = await makeGitRepo();
        plainDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "prettydiff-plain-")));
        cleanup.push(hubRoot, otherRoot, plainDir);

        const registry = new HubRegistry();
        registry.register(hubRoot, "hub-client", { isHub: true });
        server = await startServer({
            port: 0,
            version: "0.0.0-test",
            hubId: "hub-test-1",
            registry,
        });
        base = server.url;
    });

    afterAll(async () => {
        await server.close();
        await Promise.all(cleanup.map((dir) => rm(dir, { recursive: true, force: true })));
    });

    const postJson = (pathname: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(`${base}${pathname}`, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify(body),
        });

    test("/api/hub identifies the app", async () => {
        const res = await fetch(`${base}/api/hub`);
        expect(res.status).toBe(200);
        const identity = (await res.json()) as HubIdentity;
        expect(identity.app).toBe("prettydiff");
        expect(identity.version).toBe("0.0.0-test");
        expect(identity.hubId).toBe("hub-test-1");
    });

    test("register adds a git repo with a path-stable id", async () => {
        const res = await postJson("/api/hub/register", { repoRoot: otherRoot, clientId: "c1" });
        expect(res.status).toBe(200);
        const body = (await res.json()) as RegisterResponse;
        expect(body.repo.id).toBe(repoIdFor(otherRoot));
        expect(body.repo.repoRoot).toBe(otherRoot);

        const repos = (await (await fetch(`${base}/api/hub/repos`)).json()) as HubReposResponse;
        expect(repos.repos).toHaveLength(2);
        expect(repos.repos[0].isHub).toBe(true);
        expect(repos.repos[0].repoRoot).toBe(hubRoot);
        expect(repos.repos.every((repo) => typeof repo.branch === "string")).toBe(true);
    });

    test("registering through a symlinked path dedupes to the same id", async () => {
        const link = path.join(os.tmpdir(), `prettydiff-link-${Date.now()}`);
        await symlink(otherRoot, link);
        cleanup.push(link);
        const res = await postJson("/api/hub/register", { repoRoot: link, clientId: "c2" });
        expect(res.status).toBe(200);
        const body = (await res.json()) as RegisterResponse;
        expect(body.repo.id).toBe(repoIdFor(otherRoot));
    });

    test("register rejects a non-git directory", async () => {
        const res = await postJson("/api/hub/register", { repoRoot: plainDir, clientId: "c3" });
        expect(res.status).toBe(400);
    });

    test("register rejects malformed bodies", async () => {
        const res = await postJson("/api/hub/register", { nope: true });
        expect(res.status).toBe(400);
    });

    test("heartbeat: 200 for a known pair, 404 for unknown", async () => {
        const repoId = repoIdFor(otherRoot);
        expect((await postJson("/api/hub/heartbeat", { repoId, clientId: "c1" })).status).toBe(200);
        expect((await postJson("/api/hub/heartbeat", { repoId, clientId: "ghost" })).status).toBe(
            404,
        );
    });

    test("unregister is idempotent", async () => {
        const body = { repoId: "nope", clientId: "ghost" };
        expect((await postJson("/api/hub/unregister", body)).status).toBe(200);
        expect((await postJson("/api/hub/unregister", body)).status).toBe(200);
    });

    test("mutating endpoints reject foreign Host headers", async () => {
        const res = await postJson(
            "/api/hub/register",
            { repoRoot: otherRoot, clientId: "c9" },
            { host: "evil.example.com" },
        );
        expect(res.status).toBe(403);
    });

    test("mutating endpoints reject non-JSON content types", async () => {
        const res = await fetch(`${base}/api/hub/register`, {
            method: "POST",
            headers: { "content-type": "text/plain" },
            body: JSON.stringify({ repoRoot: otherRoot, clientId: "c9" }),
        });
        expect(res.status).toBe(415);
    });

    test("/api/diff without repo serves the hub repo", async () => {
        const res = await fetch(`${base}/api/diff`);
        expect(res.status).toBe(200);
        const payload = (await res.json()) as { repoRoot: string };
        expect(payload.repoRoot).toBe(hubRoot);
    });

    test("/api/diff resolves a registered repo id", async () => {
        const res = await fetch(`${base}/api/diff?repo=${repoIdFor(otherRoot)}`);
        expect(res.status).toBe(200);
        const payload = (await res.json()) as { repoRoot: string };
        expect(payload.repoRoot).toBe(otherRoot);
    });

    test("/api/diff rejects an unknown repo id with 404", async () => {
        const res = await fetch(`${base}/api/diff?repo=doesnotexist`);
        expect(res.status).toBe(404);
    });

    test("binding an occupied port rejects with EADDRINUSE", async () => {
        const registry = new HubRegistry();
        registry.register(hubRoot, "hub-client-2", { isHub: true });
        expect(
            startServer({
                port: server.port,
                version: "0.0.0-test",
                hubId: "hub-test-2",
                registry,
            }),
        ).rejects.toMatchObject({ code: "EADDRINUSE" });
    });
});
