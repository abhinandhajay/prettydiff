import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { getBranch, getDiffFile, getDiffPayload, getDiffPayloadForFiles } from "./git.js";
import { createValidatedComment, safeReadRepoFile, stampStale } from "./review.js";

import type { CommentStore } from "./commentStore.js";
import type { HubRegistry } from "./registry.js";
import type { DiffOptions } from "./types.js";

const execFileAsync = promisify(execFile);

const targetShape = {
    target: z.enum(["working-tree", "branch"]).default("working-tree"),
    targetRef: z.string().optional(),
    includeWorkingTree: z.boolean().default(true),
};

function result(value: unknown) {
    return {
        content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
        structuredContent: value as Record<string, unknown>,
    };
}

function diffOptions(input: DiffOptions): DiffOptions {
    return {
        target: input.target,
        ...(input.target === "branch"
            ? {
                  targetRef: input.targetRef,
                  includeWorkingTree: input.includeWorkingTree,
              }
            : {}),
    };
}

export async function createMcpEndpoint(options: {
    version: string;
    registry: HubRegistry;
    comments: CommentStore;
}): Promise<{
    handle: (request: Request) => Promise<Response>;
    close: () => Promise<void>;
}> {
    const { version, registry, comments } = options;

    const resolveRepo = (repoId?: string) => {
        const repo = registry.resolveRepo(repoId);
        if (!repo) throw new Error("unknown repo");
        return repo;
    };

    const loadDiff = async (input: DiffOptions & { repoId?: string }) => {
        const repo = resolveRepo(input.repoId);
        const payload = await getDiffPayload(repo.repoRoot, diffOptions(input));
        if (!payload) throw new Error("not a git repository");
        return { repo, payload };
    };

    const loadFileDiff = async (input: DiffOptions & { repoId?: string; filePath: string }) => {
        const repo = resolveRepo(input.repoId);
        const file = await getDiffFile(repo.repoRoot, input.filePath, diffOptions(input));
        if (!file) throw new Error("file is not part of this diff");
        return { repo, file };
    };

    const buildServer = () => {
        const server = new McpServer({ name: "prettydiff", version });

        server.registerTool(
            "list_repositories",
            {
                description: "List repositories currently registered with the prettydiff hub.",
                annotations: { readOnlyHint: true },
            },
            async () =>
                result({
                    repositories: await Promise.all(
                        registry.list().map(async (repo) => ({
                            ...repo,
                            branch: await getBranch(repo.repoRoot),
                        })),
                    ),
                }),
        );

        server.registerTool(
            "get_review_summary",
            {
                description: "Get diff metadata and changed-file summaries for one repository.",
                inputSchema: { repoId: z.string().optional(), ...targetShape },
                annotations: { readOnlyHint: true },
            },
            async (input) => {
                const { repo, payload } = await loadDiff(input);
                const snapshot = await comments.get(repo.id, repo.repoRoot);
                return result({
                    ...payload,
                    files: payload.files.map(
                        ({ path, oldPath, status, additions, deletions, binary, skipped }) => ({
                            path,
                            oldPath,
                            status,
                            additions,
                            deletions,
                            binary,
                            skipped,
                        }),
                    ),
                    commentCount: Object.values(snapshot.comments).flat().length,
                });
            },
        );

        server.registerTool(
            "get_file_diff",
            {
                description:
                    "Read one changed file's patch and optionally its complete old/new contents.",
                inputSchema: {
                    repoId: z.string().optional(),
                    filePath: z.string(),
                    includeContents: z.boolean().default(false),
                    ...targetShape,
                },
                annotations: { readOnlyHint: true },
            },
            async (input) => {
                const { file } = await loadFileDiff(input);
                const { oldContents, newContents, ...summary } = file;
                return result({
                    ...summary,
                    ...(input.includeContents ? { oldContents, newContents } : {}),
                });
            },
        );

        server.registerTool(
            "list_repository_files",
            {
                description:
                    "List tracked and untracked, non-ignored files in a registered repository.",
                inputSchema: {
                    repoId: z.string().optional(),
                    prefix: z.string().default(""),
                    offset: z.number().int().min(0).default(0),
                    limit: z.number().int().min(1).max(500).default(200),
                },
                annotations: { readOnlyHint: true },
            },
            async ({ repoId, prefix, offset, limit }) => {
                const repo = resolveRepo(repoId);
                const { stdout } = await execFileAsync(
                    "git",
                    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
                    { cwd: repo.repoRoot, maxBuffer: 10 * 1024 * 1024 },
                );
                const all = stdout.split("\0").filter((item) => item && item.startsWith(prefix));
                return result({
                    files: all.slice(offset, offset + limit),
                    total: all.length,
                    offset,
                    limit,
                });
            },
        );

        server.registerTool(
            "read_repository_file",
            {
                description: "Read a bounded UTF-8 text file inside a registered repository.",
                inputSchema: {
                    repoId: z.string().optional(),
                    filePath: z.string(),
                    startLine: z.number().int().min(1).default(1),
                    endLine: z.number().int().min(1).optional(),
                },
                annotations: { readOnlyHint: true },
            },
            async ({ repoId, filePath, startLine, endLine }) => {
                const repo = resolveRepo(repoId);
                return result(await safeReadRepoFile(repo.repoRoot, filePath, startLine, endLine));
            },
        );

        server.registerTool(
            "list_comments",
            {
                description:
                    "List shared review comments, stamped stale against the selected diff.",
                inputSchema: { repoId: z.string().optional(), ...targetShape },
                annotations: { readOnlyHint: true },
            },
            async (input) => {
                const repo = resolveRepo(input.repoId);
                const snapshot = await comments.get(repo.id, repo.repoRoot);
                const filePaths = Object.keys(snapshot.comments);
                const payload = filePaths.length
                    ? await getDiffPayloadForFiles(repo.repoRoot, filePaths, diffOptions(input))
                    : undefined;
                if (filePaths.length && !payload) throw new Error("not a git repository");
                return result({
                    ...snapshot,
                    comments: payload
                        ? stampStale(snapshot.comments, payload.files)
                        : snapshot.comments,
                });
            },
        );

        server.registerTool(
            "create_comment",
            {
                description: "Create an agent-authored comment on a validated diff line.",
                inputSchema: {
                    repoId: z.string().optional(),
                    filePath: z.string(),
                    side: z.enum(["additions", "deletions"]),
                    lineNumber: z.number().int().min(1),
                    body: z.string().min(1),
                    authorName: z.string().min(1).optional(),
                    ...targetShape,
                },
                annotations: { destructiveHint: false },
            },
            async (input) => {
                const { repo, file } = await loadFileDiff(input);
                const comment = createValidatedComment(file, {
                    ...input,
                    author: {
                        kind: "agent",
                        ...(input.authorName ? { name: input.authorName } : {}),
                    },
                });
                const snapshot = await comments.create(repo.id, repo.repoRoot, comment);
                return result({ comment, revision: snapshot.revision });
            },
        );

        server.registerTool(
            "update_comment",
            {
                description: "Update the body of an existing shared review comment.",
                inputSchema: {
                    repoId: z.string().optional(),
                    commentId: z.string(),
                    body: z.string().min(1),
                },
            },
            async ({ repoId, commentId, body }) => {
                const repo = resolveRepo(repoId);
                return result(
                    await comments.update(repo.id, repo.repoRoot, commentId, body.trim()),
                );
            },
        );

        server.registerTool(
            "delete_comment",
            {
                description: "Delete an existing shared review comment.",
                inputSchema: { repoId: z.string().optional(), commentId: z.string() },
                annotations: { destructiveHint: true },
            },
            async ({ repoId, commentId }) => {
                const repo = resolveRepo(repoId);
                return result(await comments.delete(repo.id, repo.repoRoot, commentId));
            },
        );

        return server;
    };

    const active = new Set<{
        server: McpServer;
        transport: WebStandardStreamableHTTPServerTransport;
    }>();
    return {
        handle: async (request) => {
            const server = buildServer();
            const transport = new WebStandardStreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true,
            });
            const connection = { server, transport };
            active.add(connection);
            try {
                await server.connect(transport);
                return await transport.handleRequest(request);
            } finally {
                active.delete(connection);
                await server.close();
            }
        },
        close: async () => {
            active.clear();
        },
    };
}
