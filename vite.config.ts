import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

interface DevFixtureBranch {
    name: string;
    current?: boolean;
}

interface DevFixtureFile {
    status?: string;
}

interface DevFixturePayload {
    branch: string;
    branches?: DevFixtureBranch[];
    target?: "working-tree" | "branch";
    targetRef?: string;
    mergeBase?: string;
    includeWorkingTree?: boolean;
    generatedAt?: string;
    files?: DevFixtureFile[];
}

function refOffset(ref: string): number {
    let total = 0;
    for (const char of ref) total += char.charCodeAt(0);
    return total;
}

function applyDevFixtureOptions(payload: DevFixturePayload, url: URL): DevFixturePayload {
    const target = url.searchParams.get("target") === "branch" ? "branch" : "working-tree";
    const branches = payload.branches ?? [{ name: payload.branch, current: true }];
    const fallbackTargetRef = branches.find((branch) => !branch.current)?.name ?? payload.branch;
    const targetRef = url.searchParams.get("targetRef") || payload.targetRef || fallbackTargetRef;
    const branchOptions = branches.some((branch) => branch.name === targetRef)
        ? branches
        : [{ name: targetRef }, ...branches];
    const includeWorkingTree = url.searchParams.get("includeWorkingTree") !== "0";
    const files = payload.files ?? [];
    const visibleFiles =
        target === "working-tree"
            ? files
            : files.filter((_, index) => (index + refOffset(targetRef)) % 3 !== 0);

    return {
        ...payload,
        branches: branchOptions,
        target,
        ...(target === "branch"
            ? { targetRef, mergeBase: "f1a7b3e0c9d2e4f6", includeWorkingTree }
            : {}),
        generatedAt: new Date().toISOString(),
        files:
            target === "branch" && !includeWorkingTree
                ? visibleFiles.filter((file) => file.status !== "untracked")
                : visibleFiles,
    };
}

function fixtureFor(url: URL): string {
    switch (url.searchParams.get("fixture")) {
        case "empty":
            return "sample-diff-empty.json";
        case "xl":
            return "sample-diff-xl.json";
        default:
            return "sample-diff.json";
    }
}

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
                        const fixture = fixtureFor(url);
                        try {
                            const text = await readFile(
                                path.join(here, "fixtures", fixture),
                                "utf8",
                            );
                            const payload = applyDevFixtureOptions(JSON.parse(text), url);
                            res.setHeader("content-type", "application/json");
                            res.end(JSON.stringify(payload));
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
