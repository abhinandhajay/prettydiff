import mri from "mri";

import { CommentStore } from "./commentStore.js";
import { canonicalRepoRoot, getDiffFile, getDiffPayloadForFiles } from "./git.js";
import { repoIdFor } from "./registry.js";
import { createValidatedComment, stampStale } from "./review.js";

import type { DiffOptions } from "./types.js";

export const COMMENTS_HELP = `prettydiff comments — manage comments shared with the Pretty Diff viewer

Usage:
  prettydiff comments <command> [options]

Commands:
  list      List shared comments as JSON
  add       Add an agent-authored comment to a diff line
  update    Update a comment body
  delete    Delete a comment

Run "prettydiff comments <command> --help" for command-specific help.
`;

export const COMMENTS_LIST_HELP = `prettydiff comments list — list shared comments

Usage:
  prettydiff comments list [target options]

Target options:
  --target <mode>              working-tree (default) or branch
  --target-ref <ref>           Base branch/ref when --target branch is selected
  --no-include-working-tree    Exclude uncommitted changes in branch mode
  --help                       Print this help and exit

Output:
  JSON containing the comment-store revision and comments stamped with stale state
  against the selected diff.

Example:
  prettydiff comments list --target branch --target-ref main
`;

export const COMMENTS_ADD_HELP = `prettydiff comments add — add a shared agent comment

Usage:
  prettydiff comments add --file <path> --side <side> --line <number> --body <text>
      [--author <name>] [target options]

Required options:
  --file <path>                Repository-relative path in the selected diff
  --side <side>                additions or deletions
  --line <number>              One-based line number on the selected side
  --body <text>                Comment body

Other options:
  --author <name>              Agent display name, such as Codex or Claude
  --target <mode>              working-tree (default) or branch
  --target-ref <ref>           Base branch/ref when --target branch is selected
  --no-include-working-tree    Exclude uncommitted changes in branch mode
  --help                       Print this help and exit

Output:
  JSON containing the created comment and comment-store revision.

Example:
  prettydiff comments add --file src/app.ts --side additions --line 42 \\
      --body "Handle the rejected promise." --author Codex
`;

export const COMMENTS_UPDATE_HELP = `prettydiff comments update — update a shared comment

Usage:
  prettydiff comments update --id <comment-id> --body <text>

Options:
  --id <comment-id>    ID returned by comments list or add
  --body <text>        Replacement comment body
  --help               Print this help and exit

Output:
  JSON containing the updated comment and comment-store revision.

Example:
  prettydiff comments update --id 3e22c8d0 --body "Handle both rejection paths."
`;

export const COMMENTS_DELETE_HELP = `prettydiff comments delete — delete a shared comment

Usage:
  prettydiff comments delete --id <comment-id>

Options:
  --id <comment-id>    ID returned by comments list or add
  --help               Print this help and exit

Output:
  JSON containing the deleted comment ID and comment-store revision.

Example:
  prettydiff comments delete --id 3e22c8d0
`;

interface CommandIo {
    cwd: string;
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    commentStore?: CommentStore;
}

const TARGET_FLAGS = new Set(["help", "target", "target-ref", "include-working-tree"]);

function flagName(arg: string): string | null {
    if (!arg.startsWith("--")) return null;
    const name = arg.slice(2).split("=", 1)[0];
    return name.startsWith("no-") ? name.slice(3) : name;
}

function unknownFlag(argv: string[], allowed: Set<string>): string | undefined {
    return argv.map(flagName).find((name) => name !== null && !allowed.has(name)) ?? undefined;
}

function usageError(io: CommandIo, message: string, command: string): number {
    io.stderr(`prettydiff: ${message}\nRun "${command} --help" for usage.\n`);
    return 2;
}

function parseTarget(args: Record<string, unknown>): DiffOptions | string {
    const target = args.target ?? "working-tree";
    if (target !== "working-tree" && target !== "branch") {
        return "--target must be working-tree or branch";
    }
    if (target === "working-tree" && args["target-ref"] !== undefined) {
        return "--target-ref requires --target branch";
    }
    if (target === "working-tree" && args["include-working-tree"] === false) {
        return "--no-include-working-tree requires --target branch";
    }
    return {
        target,
        ...(target === "branch"
            ? {
                  targetRef:
                      typeof args["target-ref"] === "string" ? args["target-ref"] : undefined,
                  includeWorkingTree: args["include-working-tree"] !== false,
              }
            : {}),
    };
}

async function repository(io: CommandIo) {
    const repoRoot = await canonicalRepoRoot(io.cwd);
    if (!repoRoot) throw new Error("not a git repository");
    return { repoRoot, repoId: repoIdFor(repoRoot) };
}

function findComment<T extends { id: string }>(comments: Record<string, T[]>, id: string): T {
    const comment = Object.values(comments)
        .flat()
        .find((item) => item.id === id);
    if (!comment) throw new Error("comment not found");
    return comment;
}

function writeJson(io: CommandIo, value: unknown): number {
    io.stdout(JSON.stringify(value, null, 2) + "\n");
    return 0;
}

export async function runCommentsCommand(argv: string[], io: CommandIo): Promise<number> {
    const command = argv[0];
    if (!command || command === "--help" || command === "-h") {
        io.stdout(COMMENTS_HELP);
        return 0;
    }

    const helpByCommand: Record<string, string> = {
        list: COMMENTS_LIST_HELP,
        add: COMMENTS_ADD_HELP,
        update: COMMENTS_UPDATE_HELP,
        delete: COMMENTS_DELETE_HELP,
    };
    const help = helpByCommand[command];
    if (!help) return usageError(io, `unknown comments command: ${command}`, "prettydiff comments");

    const commandArgv = argv.slice(1);
    const allowed = new Set(TARGET_FLAGS);
    if (command === "add") {
        for (const name of ["file", "side", "line", "body", "author"]) allowed.add(name);
    } else if (command === "update") {
        allowed.clear();
        for (const name of ["help", "id", "body"]) allowed.add(name);
    } else if (command === "delete") {
        allowed.clear();
        for (const name of ["help", "id"]) allowed.add(name);
    }
    const unknown = unknownFlag(commandArgv, allowed);
    if (unknown)
        return usageError(
            io,
            `unknown option for comments ${command}: --${unknown}`,
            `prettydiff comments ${command}`,
        );

    const args = mri(commandArgv, {
        boolean: ["help", "include-working-tree"],
        string: ["target", "target-ref", "file", "side", "body", "author", "id"],
        default: { "include-working-tree": true },
        alias: { h: "help" },
    });
    if (args.help) {
        io.stdout(help);
        return 0;
    }
    if (args._.length) {
        return usageError(
            io,
            `unexpected argument: ${args._[0]}`,
            `prettydiff comments ${command}`,
        );
    }

    const target = parseTarget(args);
    if (typeof target === "string") {
        return usageError(io, target, `prettydiff comments ${command}`);
    }

    if (command === "add") {
        if (!args.file) return usageError(io, "--file is required", "prettydiff comments add");
        if (args.side !== "additions" && args.side !== "deletions") {
            return usageError(
                io,
                "--side must be additions or deletions",
                "prettydiff comments add",
            );
        }
        const lineNumber = Number(args.line);
        if (!Number.isInteger(lineNumber) || lineNumber < 1) {
            return usageError(io, "--line must be a positive integer", "prettydiff comments add");
        }
        if (!args.body?.trim()) {
            return usageError(io, "--body is required", "prettydiff comments add");
        }
    }
    if (command === "update" && (!args.id || !args.body?.trim())) {
        return usageError(io, "--id and --body are required", "prettydiff comments update");
    }
    if (command === "delete" && !args.id) {
        return usageError(io, "--id is required", "prettydiff comments delete");
    }

    try {
        const { repoRoot, repoId } = await repository(io);
        const comments = io.commentStore ?? new CommentStore();
        if (command === "list") {
            const snapshot = await comments.get(repoId, repoRoot);
            const filePaths = Object.keys(snapshot.comments);
            const payload = filePaths.length
                ? await getDiffPayloadForFiles(repoRoot, filePaths, target)
                : undefined;
            if (payload === null) throw new Error("not a git repository");
            return writeJson(io, {
                ...snapshot,
                comments: payload
                    ? stampStale(snapshot.comments, payload.files)
                    : snapshot.comments,
            });
        }
        if (command === "add") {
            const file = await getDiffFile(repoRoot, args.file, target);
            const comment = createValidatedComment(file, {
                filePath: args.file,
                side: args.side,
                lineNumber: Number(args.line),
                body: args.body,
                author: {
                    kind: "agent",
                    ...(args.author?.trim() ? { name: args.author.trim() } : {}),
                },
            });
            const snapshot = await comments.create(repoId, repoRoot, comment);
            return writeJson(io, { revision: snapshot.revision, comment });
        }
        if (command === "update") {
            const snapshot = await comments.update(repoId, repoRoot, args.id, args.body.trim());
            return writeJson(io, {
                revision: snapshot.revision,
                comment: findComment(snapshot.comments, args.id),
            });
        }
        const snapshot = await comments.delete(repoId, repoRoot, args.id);
        return writeJson(io, { revision: snapshot.revision, deletedId: args.id });
    } catch (error) {
        io.stderr(`prettydiff: ${(error as Error).message}\n`);
        return 1;
    }
}
