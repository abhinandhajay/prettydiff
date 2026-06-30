import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serve, type ServerType } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

import { getDiffPayload } from "./git.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/cli/server.js → ../web → dist/web
const WEB_ROOT = path.resolve(here, "..", "web");

export interface StartedServer {
    url: string;
    close: () => Promise<void>;
}

export async function startServer(repoRoot: string, port: number): Promise<StartedServer> {
    const app = new Hono();

    app.get("/api/diff", async (c) => {
        const target = c.req.query("target") === "branch" ? "branch" : "working-tree";
        const targetRef = c.req.query("targetRef") || undefined;
        const payload = await getDiffPayload(repoRoot, { target, targetRef });
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

    return new Promise((resolve) => {
        const server: ServerType = serve(
            { fetch: app.fetch, port, hostname: "127.0.0.1" },
            ({ port: actualPort }) => {
                resolve({
                    url: `http://127.0.0.1:${actualPort}`,
                    close: () =>
                        new Promise<void>((res) => {
                            server.close(() => res());
                            if ("closeAllConnections" in server) {
                                server.closeAllConnections();
                            }
                        }),
                });
            },
        );
    });
}
