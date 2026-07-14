import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
    cleanupDir,
    commitFile,
    makeRepo,
    makeTmpDir,
    writeRepoFile,
} from "../../test/helpers/tmpRepo";
import { makeWebRoot, SPA_MARKER } from "../../test/helpers/webRoot";

import { startServer, type StartedServer } from "./server.js";

import type { DiffPayload } from "./types.js";

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

async function withServer(
    root: string,
    fn: (srv: StartedServer) => Promise<void>,
    web?: string,
): Promise<void> {
    // Port 0 lets the OS pick a free ephemeral port; the returned url has the real one.
    const srv = await startServer(root, 0, web);
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
        const srv = await startServer(repo, 0);
        await srv.close();
        await expect(fetch(`${srv.url}/api/diff`)).rejects.toThrow();
    });
});
