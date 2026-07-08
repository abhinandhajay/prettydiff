import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serve, type ServerType } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";

import { canonicalRepoRoot, getBranch, getDiffPayload } from "./git.js";

import type { HubRegistry } from "./registry.js";
import type {
    HeartbeatRequest,
    HubIdentity,
    HubReposResponse,
    RegisterRequest,
    RegisterResponse,
    UnregisterRequest,
} from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/cli/server.js → ../web → dist/web
const WEB_ROOT = path.resolve(here, "..", "web");

const PRUNE_INTERVAL_MS = 5000;

export interface StartedServer {
    url: string;
    port: number;
    close: () => Promise<void>;
}

export interface ServerOptions {
    port: number;
    version: string;
    hubId: string;
    registry: HubRegistry;
}

// Loopback-only CSRF posture: mutating routes require a local Host (defeats DNS
// rebinding) and a JSON content type (forces a preflight no CORS headers answer).
function rejectNonLocalMutation(c: Context): Response | null {
    const hostname = (c.req.header("host") ?? "").replace(/:\d+$/, "");
    if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "[::1]") {
        return c.json({ error: "forbidden" }, 403);
    }
    if (!(c.req.header("content-type") ?? "").includes("application/json")) {
        return c.json({ error: "expected application/json" }, 415);
    }
    return null;
}

async function readJson<T>(c: Context): Promise<T | null> {
    try {
        return (await c.req.json()) as T;
    } catch {
        return null;
    }
}

export async function startServer(options: ServerOptions): Promise<StartedServer> {
    const { port, version, hubId, registry } = options;
    const app = new Hono();

    app.get("/api/hub", (c) => {
        return c.json({ app: "prettydiff", version, hubId } satisfies HubIdentity);
    });

    app.get("/api/hub/repos", async (c) => {
        const repos = await Promise.all(
            registry.list().map(async (repo) => ({
                ...repo,
                branch: await getBranch(repo.repoRoot),
            })),
        );
        return c.json({ hubId, repos } satisfies HubReposResponse);
    });

    app.post("/api/hub/register", async (c) => {
        const rejected = rejectNonLocalMutation(c);
        if (rejected) return rejected;
        const body = await readJson<RegisterRequest>(c);
        if (typeof body?.repoRoot !== "string" || typeof body.clientId !== "string") {
            return c.json({ error: "invalid request" }, 400);
        }
        const repoRoot = await canonicalRepoRoot(body.repoRoot);
        if (!repoRoot) return c.json({ error: "not a git repository" }, 400);
        const repo = registry.register(repoRoot, body.clientId);
        return c.json({ hubId, repo } satisfies RegisterResponse);
    });

    app.post("/api/hub/heartbeat", async (c) => {
        const rejected = rejectNonLocalMutation(c);
        if (rejected) return rejected;
        const body = await readJson<HeartbeatRequest>(c);
        if (typeof body?.repoId !== "string" || typeof body.clientId !== "string") {
            return c.json({ error: "invalid request" }, 400);
        }
        if (!registry.heartbeat(body.repoId, body.clientId)) {
            return c.json({ error: "unknown client" }, 404);
        }
        return c.json({ ok: true, hubId });
    });

    app.post("/api/hub/unregister", async (c) => {
        const rejected = rejectNonLocalMutation(c);
        if (rejected) return rejected;
        const body = await readJson<UnregisterRequest>(c);
        if (typeof body?.repoId !== "string" || typeof body.clientId !== "string") {
            return c.json({ error: "invalid request" }, 400);
        }
        registry.unregister(body.repoId, body.clientId);
        return c.json({ ok: true });
    });

    app.get("/api/diff", async (c) => {
        const repoRoot = registry.resolveRepoRoot(c.req.query("repo"));
        if (!repoRoot) return c.json({ error: "unknown repo" }, 404);
        const target = c.req.query("target") === "branch" ? "branch" : "working-tree";
        const targetRef = c.req.query("targetRef") || undefined;
        const includeWorkingTree = c.req.query("includeWorkingTree") !== "0";
        const payload = await getDiffPayload(repoRoot, { target, targetRef, includeWorkingTree });
        if (!payload) return c.json({ error: "not a git repository" }, 500);
        return c.json(payload);
    });

    app.use(
        "/assets/*",
        serveStatic({
            root: path.relative(process.cwd(), WEB_ROOT) || ".",
        }),
    );

    app.get("*", async (c) => {
        try {
            const html = await readFile(path.join(WEB_ROOT, "index.html"), "utf8");
            return c.html(html);
        } catch {
            return c.text("prettydiff: web bundle missing. Reinstall the package.", 500);
        }
    });

    return new Promise((resolve, reject) => {
        const prune = setInterval(() => registry.prune(), PRUNE_INTERVAL_MS);
        prune.unref();
        const onError = (err: Error) => {
            clearInterval(prune);
            reject(err);
        };
        let server: ServerType;
        try {
            server = serve(
                { fetch: app.fetch, port, hostname: "127.0.0.1" },
                ({ port: actualPort }) => {
                    server.off("error", onError);
                    resolve({
                        url: `http://127.0.0.1:${actualPort}`,
                        port: actualPort,
                        close: () =>
                            new Promise<void>((res) => {
                                clearInterval(prune);
                                server.close(() => res());
                                if ("closeAllConnections" in server) {
                                    server.closeAllConnections();
                                }
                            }),
                    });
                },
            );
        } catch (err) {
            onError(err as Error);
            return;
        }
        server.once("error", onError);
    });
}
