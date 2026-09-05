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

const DEV_HUB_ID = "dev-hub";
const DEV_REPOS = [
    { id: "fixture-a", repoRoot: "/Users/dev/example/app", isHub: true, branch: "main" },
    { id: "fixture-b", repoRoot: "/Users/dev/example/api", branch: "feat/replies" },
    { id: "fixture-c", repoRoot: "/Users/dev/example/monorepo", branch: "release/2.4" },
    {
        id: "fixture-d",
        repoRoot:
            "/Users/dev/example/clients/acme-corporation/projects/2026/website-redesign-quarterly-marketing-campaign-landing-pages",
        branch: "feature/extremely-long-branch-name-for-truncation-testing",
    },
];

function applyDevRepo(
    payload: DevFixturePayload & { repoRoot?: string },
    url: URL,
): (DevFixturePayload & { repoRoot?: string }) | null {
    const repoId = url.searchParams.get("repo");
    if (!repoId) return payload;
    const repo = DEV_REPOS.find((r) => r.id === repoId);
    if (!repo) return null;
    const files = payload.files ?? [];
    return {
        ...payload,
        repoRoot: repo.repoRoot,
        branch: repo.branch,
        // Vary the file list per repo so switching visibly changes content.
        files: repo.isHub
            ? files
            : files.filter((_, index) => (index + refOffset(repo.id)) % 4 !== 0),
    };
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

function appendRecordItem(record: Record<string, unknown[]>, key: string, item: unknown): void {
    const existing = Object.hasOwn(record, key) ? record[key] : undefined;
    Object.defineProperty(record, key, {
        value: existing ? [...existing, item] : [item],
        enumerable: true,
        configurable: true,
        writable: true,
    });
}

function setRecordItems(record: Record<string, unknown[]>, key: string, items: unknown[]): void {
    Object.defineProperty(record, key, {
        value: items,
        enumerable: true,
        configurable: true,
        writable: true,
    });
}

export default defineConfig({
    root: here,
    plugins: [
        react(),
        tailwindcss(),
        {
            name: "prettydiff-dev-fixture",
            configureServer(server) {
                const commentsByRepo = new Map<
                    string,
                    { revision: number; comments: Record<string, unknown[]> }
                >();
                server.middlewares.use(async (req, res, next) => {
                    const sendJson = (body: unknown, status = 200) => {
                        res.statusCode = status;
                        res.setHeader("content-type", "application/json");
                        res.end(JSON.stringify(body));
                    };
                    const readBody = async () => {
                        const chunks: Buffer[] = [];
                        for await (const chunk of req) chunks.push(Buffer.from(chunk));
                        return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
                    };
                    if (req.url && req.url.startsWith("/api/comments")) {
                        const url = new URL(req.url, "http://localhost");
                        const repoId = url.searchParams.get("repo") ?? "fixture-a";
                        const snapshot = commentsByRepo.get(repoId) ?? {
                            revision: 0,
                            comments: {},
                        };
                        const save = (comments: Record<string, unknown[]>) => {
                            const next = { revision: snapshot.revision + 1, comments };
                            commentsByRepo.set(repoId, next);
                            sendJson(next);
                        };
                        if (req.method === "GET") {
                            const etag = `"${snapshot.revision}"`;
                            if (req.headers["if-none-match"] === etag) {
                                res.statusCode = 304;
                                res.end();
                            } else {
                                res.setHeader("etag", etag);
                                sendJson(snapshot);
                            }
                            return;
                        }
                        const body = (await readBody()) as Record<string, unknown>;
                        if (req.method === "POST" && url.pathname.endsWith("/import")) {
                            const merged = structuredClone(snapshot.comments);
                            const known = new Set(
                                Object.values(merged)
                                    .flat()
                                    .map((item) => (item as { id?: string }).id),
                            );
                            for (const [filePath, list] of Object.entries(
                                (body.comments as Record<string, unknown[]>) ?? {},
                            )) {
                                for (const item of list) {
                                    const comment = item as { id?: string; author?: unknown };
                                    if (!comment.id || known.has(comment.id)) continue;
                                    comment.author ??= { kind: "user" };
                                    appendRecordItem(merged, filePath, comment);
                                    known.add(comment.id);
                                }
                            }
                            save(merged);
                            return;
                        }
                        if (req.method === "POST" && url.pathname === "/api/comments") {
                            const comment = {
                                ...body,
                                id: typeof body.id === "string" ? body.id : crypto.randomUUID(),
                                createdAt: Date.now(),
                                author: { kind: "user" },
                            };
                            const merged = structuredClone(snapshot.comments);
                            appendRecordItem(merged, body.filePath as string, comment);
                            const next = {
                                revision: snapshot.revision + 1,
                                comments: merged,
                                comment,
                            };
                            commentsByRepo.set(repoId, next);
                            sendJson(next);
                            return;
                        }
                        const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
                        const merged: Record<string, unknown[]> = {};
                        let found = false;
                        for (const [filePath, list] of Object.entries(snapshot.comments)) {
                            const changed = list
                                .filter((item) => {
                                    if (req.method !== "DELETE") return true;
                                    const match = (item as { id?: string }).id === id;
                                    found ||= match;
                                    return !match;
                                })
                                .map((item) => {
                                    if (
                                        req.method === "PATCH" &&
                                        (item as { id?: string }).id === id
                                    ) {
                                        found = true;
                                        return { ...(item as object), body: body.body };
                                    }
                                    return item;
                                });
                            if (changed.length) setRecordItems(merged, filePath, changed);
                        }
                        if (!found) sendJson({ error: "comment not found" }, 404);
                        else save(merged);
                        return;
                    }
                    if (req.url && req.url.startsWith("/api/hub/repos")) {
                        sendJson({ hubId: DEV_HUB_ID, repos: DEV_REPOS });
                        return;
                    }
                    if (req.url && req.url.startsWith("/api/hub")) {
                        sendJson({ app: "prettydiff", version: "dev", hubId: DEV_HUB_ID });
                        return;
                    }
                    if (req.url && req.url.startsWith("/api/diff")) {
                        const url = new URL(req.url, "http://localhost");
                        const fixture = fixtureFor(url);
                        try {
                            const text = await readFile(
                                path.join(here, "fixtures", fixture),
                                "utf8",
                            );
                            const scoped = applyDevRepo(JSON.parse(text), url);
                            if (!scoped) {
                                sendJson({ error: "unknown repo" }, 404);
                                return;
                            }
                            sendJson(applyDevFixtureOptions(scoped, url));
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
