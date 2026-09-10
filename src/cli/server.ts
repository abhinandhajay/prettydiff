import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serve, type ServerType } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";

import { CommentStore } from "./commentStore.js";
import {
    canonicalRepoRoot,
    getBranch,
    getDiffFile,
    getDiffPayload,
    getDiffPayloadForFiles,
} from "./git.js";
import { createValidatedComment, stampStale } from "./review.js";

import type { HubRegistry } from "./registry.js";
import type {
    CommentSnapshot,
    DiffPayload,
    HeartbeatRequest,
    HubIdentity,
    HubReposResponse,
    RegisterRequest,
    RegisterResponse,
    RepoInfo,
    UnregisterRequest,
} from "./types.js";
import type { Socket } from "node:net";

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
    commentStore?: CommentStore;
    webRoot?: string;
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

function diffOptions(c: Context) {
    const target =
        c.req.query("target") === "branch" ? ("branch" as const) : ("working-tree" as const);
    return {
        target,
        ...(target === "branch"
            ? {
                  targetRef: c.req.query("targetRef") || undefined,
                  includeWorkingTree: c.req.query("includeWorkingTree") !== "0",
              }
            : {}),
    };
}

function commentEtag(revision: number, payload?: DiffPayload): string {
    const digest = createHash("sha256")
        .update(
            payload
                ? JSON.stringify({
                      head: payload.head,
                      target: payload.target,
                      targetRef: payload.targetRef,
                      includeWorkingTree: payload.includeWorkingTree,
                      files: payload.files.map((file) => [
                          file.path,
                          file.oldPath,
                          file.rawPatch,
                          file.oldContents,
                          file.newContents,
                      ]),
                  })
                : "no-comments",
        )
        .digest("hex")
        .slice(0, 16);
    return `"${revision}-${digest}"`;
}

async function readJson<T>(c: Context): Promise<T | null> {
    try {
        return (await c.req.json()) as T;
    } catch {
        return null;
    }
}

export async function startServer(options: ServerOptions): Promise<StartedServer> {
    const { port, version, hubId, registry, webRoot = WEB_ROOT } = options;
    const comments = options.commentStore ?? new CommentStore();
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
        const payload = await getDiffPayload(repoRoot, diffOptions(c));
        if (!payload) return c.json({ error: "not a git repository" }, 500);
        return c.json(payload);
    });

    const resolveReviewFile = async (c: Context, filePath: string) => {
        const repo = registry.resolveRepo(c.req.query("repo"));
        if (!repo) return null;
        const file = await getDiffFile(repo.repoRoot, filePath, diffOptions(c));
        return { repo, file };
    };

    const reviewSnapshot = async (c: Context, repo: RepoInfo, snapshot: CommentSnapshot) => {
        const filePaths = Object.keys(snapshot.comments);
        if (!filePaths.length) return { snapshot, payload: undefined };
        const payload = await getDiffPayloadForFiles(repo.repoRoot, filePaths, diffOptions(c));
        if (payload === null) throw new Error("not a git repository");
        return {
            snapshot: { ...snapshot, comments: stampStale(snapshot.comments, payload.files) },
            payload,
        };
    };

    app.get("/api/comments", async (c) => {
        const repo = registry.resolveRepo(c.req.query("repo"));
        if (!repo) return c.json({ error: "unknown repo" }, 404);
        try {
            const snapshot = await comments.get(repo.id, repo.repoRoot);
            const reviewed = await reviewSnapshot(c, repo, snapshot);
            const { payload } = reviewed;
            const etag = commentEtag(snapshot.revision, payload);
            if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304 });
            c.header("etag", etag);
            return c.json(reviewed.snapshot);
        } catch (error) {
            return c.json({ error: (error as Error).message }, 500);
        }
    });

    app.post("/api/comments/import", async (c) => {
        const rejected = rejectNonLocalMutation(c);
        if (rejected) return rejected;
        const repo = registry.resolveRepo(c.req.query("repo"));
        if (!repo) return c.json({ error: "unknown repo" }, 404);
        const body = await readJson<{ comments?: Record<string, unknown[]> }>(c);
        if (!body?.comments || typeof body.comments !== "object")
            return c.json({ error: "invalid request" }, 400);
        try {
            const snapshot = await comments.import(repo.id, repo.repoRoot, body.comments as never);
            return c.json((await reviewSnapshot(c, repo, snapshot)).snapshot);
        } catch (error) {
            return c.json({ error: (error as Error).message }, 500);
        }
    });

    app.post("/api/comments", async (c) => {
        const rejected = rejectNonLocalMutation(c);
        if (rejected) return rejected;
        const body = await readJson<{
            id?: string;
            filePath?: string;
            side?: "additions" | "deletions";
            lineNumber?: number;
            lineText?: string;
            body?: string;
        }>(c);
        if (
            typeof body?.filePath !== "string" ||
            (body.side !== "additions" && body.side !== "deletions") ||
            typeof body.lineNumber !== "number" ||
            typeof body.lineText !== "string" ||
            typeof body.body !== "string"
        ) {
            return c.json({ error: "invalid request" }, 400);
        }
        const review = await resolveReviewFile(c, body.filePath);
        if (!review) return c.json({ error: "unknown repo" }, 404);
        try {
            const comment = createValidatedComment(review.file, {
                ...body,
                filePath: body.filePath,
                side: body.side,
                lineNumber: body.lineNumber,
                lineText: body.lineText,
                body: body.body,
                author: { kind: "user" },
            });
            const snapshot = await comments.create(review.repo.id, review.repo.repoRoot, comment);
            return c.json({
                ...(await reviewSnapshot(c, review.repo, snapshot)).snapshot,
                comment,
            });
        } catch (error) {
            return c.json({ error: (error as Error).message }, 400);
        }
    });

    app.patch("/api/comments/:id", async (c) => {
        const rejected = rejectNonLocalMutation(c);
        if (rejected) return rejected;
        const repo = registry.resolveRepo(c.req.query("repo"));
        if (!repo) return c.json({ error: "unknown repo" }, 404);
        const body = await readJson<{ body?: string }>(c);
        if (typeof body?.body !== "string" || !body.body.trim())
            return c.json({ error: "invalid request" }, 400);
        try {
            const snapshot = await comments.update(
                repo.id,
                repo.repoRoot,
                c.req.param("id"),
                body.body.trim(),
            );
            return c.json((await reviewSnapshot(c, repo, snapshot)).snapshot);
        } catch (error) {
            return c.json({ error: (error as Error).message }, 404);
        }
    });

    app.delete("/api/comments/:id", async (c) => {
        const rejected = rejectNonLocalMutation(c);
        if (rejected) return rejected;
        const repo = registry.resolveRepo(c.req.query("repo"));
        if (!repo) return c.json({ error: "unknown repo" }, 404);
        try {
            const snapshot = await comments.delete(repo.id, repo.repoRoot, c.req.param("id"));
            return c.json((await reviewSnapshot(c, repo, snapshot)).snapshot);
        } catch (error) {
            return c.json({ error: (error as Error).message }, 404);
        }
    });

    app.use(
        "/assets/*",
        serveStatic({
            root: path.relative(process.cwd(), webRoot) || ".",
        }),
    );

    app.get("*", async (c) => {
        try {
            const html = await readFile(path.join(webRoot, "index.html"), "utf8");
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
        const sockets = new Set<Socket>();
        try {
            server = serve(
                { fetch: app.fetch, port, hostname: "127.0.0.1" },
                ({ port: actualPort }) => {
                    server.off("error", onError);
                    resolve({
                        url: `http://127.0.0.1:${actualPort}`,
                        port: actualPort,
                        close: async () => {
                            clearInterval(prune);
                            for (const socket of sockets) socket.destroy();
                            await new Promise<void>((res) => {
                                server.close(() => res());
                                if ("closeAllConnections" in server) {
                                    server.closeAllConnections();
                                }
                                setTimeout(res, 250).unref();
                            });
                        },
                    });
                },
            );
            server.on("connection", (socket: Socket) => {
                sockets.add(socket);
                socket.once("close", () => sockets.delete(socket));
            });
        } catch (err) {
            onError(err as Error);
            return;
        }
        server.once("error", onError);
    });
}
