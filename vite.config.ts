import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: here,
    plugins: [
        react(),
        tailwindcss(),
        {
            name: "prettydiff-dev-fixture",
            configureServer(server) {
                server.middlewares.use(async (req, res, next) => {
                    if (req.url && req.url.startsWith("/api/diff")) {
                        const url = new URL(req.url, "http://localhost");
                        const fixture =
                            url.searchParams.get("fixture") === "xl"
                                ? "sample-diff-xl.json"
                                : "sample-diff.json";
                        try {
                            const text = await readFile(
                                path.join(here, "fixtures", fixture),
                                "utf8",
                            );
                            res.setHeader("content-type", "application/json");
                            res.end(text);
                        } catch (err) {
                            res.statusCode = 500;
                            res.end(`fixture error: ${(err as Error).message}`);
                        }
                        return;
                    }
                    next();
                });
            },
        },
    ],
    resolve: {
        alias: {
            "@": path.resolve(here, "src/web"),
        },
    },
    build: {
        outDir: "dist/web",
        emptyOutDir: true,
    },
});
