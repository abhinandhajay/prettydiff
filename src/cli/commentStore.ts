import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { CommentMap, CommentSnapshot, DiffComment } from "./types.js";

interface StoredReview extends CommentSnapshot {
    schemaVersion: 1;
    repoRoot: string;
}

function defaultDataDir(): string {
    if (process.env.PRETTYDIFF_DATA_DIR) return process.env.PRETTYDIFF_DATA_DIR;
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Application Support", "prettydiff");
    }
    if (process.platform === "win32") {
        return path.join(process.env.APPDATA ?? os.homedir(), "prettydiff");
    }
    return path.join(
        process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
        "prettydiff",
    );
}

function isComment(value: unknown): value is DiffComment {
    const c = value as Partial<DiffComment> | null;
    return Boolean(
        c &&
        typeof c.id === "string" &&
        typeof c.filePath === "string" &&
        (c.side === "additions" || c.side === "deletions") &&
        typeof c.lineNumber === "number" &&
        Number.isInteger(c.lineNumber) &&
        c.lineNumber > 0 &&
        (c.lineType === "change-addition" ||
            c.lineType === "change-deletion" ||
            c.lineType === "context" ||
            c.lineType === "context-expanded") &&
        typeof c.lineText === "string" &&
        typeof c.body === "string" &&
        typeof c.createdAt === "number" &&
        Number.isFinite(c.createdAt) &&
        c.author &&
        (c.author.kind === "user" || c.author.kind === "agent") &&
        (c.author.name === undefined || typeof c.author.name === "string") &&
        (c.stale === undefined || typeof c.stale === "boolean"),
    );
}

function validateStored(value: unknown): StoredReview {
    const review = value as Partial<StoredReview> | null;
    if (
        !review ||
        review.schemaVersion !== 1 ||
        typeof review.repoRoot !== "string" ||
        typeof review.revision !== "number" ||
        !review.comments ||
        typeof review.comments !== "object"
    ) {
        throw new Error("invalid review data");
    }
    for (const list of Object.values(review.comments)) {
        if (!Array.isArray(list) || !list.every(isComment)) throw new Error("invalid review data");
    }
    return review as StoredReview;
}

function copySnapshot(review: StoredReview): CommentSnapshot {
    return { revision: review.revision, comments: structuredClone(review.comments) };
}

export class CommentStore {
    private reviewsDir: string;

    constructor(dataDir = defaultDataDir()) {
        this.reviewsDir = path.join(dataDir, "reviews");
    }

    private file(repoId: string): string {
        if (!/^[a-f0-9]{12}$/.test(repoId)) throw new Error("invalid repo id");
        return path.join(this.reviewsDir, `${repoId}.json`);
    }

    private async read(repoId: string, repoRoot: string): Promise<StoredReview> {
        try {
            return validateStored(JSON.parse(await readFile(this.file(repoId), "utf8")));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return { schemaVersion: 1, repoRoot, revision: 0, comments: {} };
            }
            throw new Error(
                `prettydiff: cannot read stored comments for ${repoRoot}: ${(error as Error).message}`,
            );
        }
    }

    async get(repoId: string, repoRoot: string): Promise<CommentSnapshot> {
        return copySnapshot(await this.read(repoId, repoRoot));
    }

    private async withLock<T>(repoId: string, fn: () => Promise<T>): Promise<T> {
        await mkdir(this.reviewsDir, { recursive: true });
        const lock = `${this.file(repoId)}.lock`;
        const deadline = Date.now() + 5000;
        while (true) {
            try {
                await mkdir(lock);
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
                if (Date.now() > deadline)
                    throw new Error("timed out waiting for comment store lock");
                try {
                    const info = await stat(lock);
                    if (Date.now() - info.mtimeMs > 30_000) await rm(lock, { recursive: true });
                } catch {
                    // Another process released the lock between checks.
                }
                await new Promise((resolve) => setTimeout(resolve, 25));
            }
        }
        try {
            return await fn();
        } finally {
            await rm(lock, { recursive: true, force: true });
        }
    }

    private async mutate(
        repoId: string,
        repoRoot: string,
        change: (review: StoredReview) => void,
    ): Promise<CommentSnapshot> {
        return this.withLock(repoId, async () => {
            const review = await this.read(repoId, repoRoot);
            change(review);
            review.revision += 1;
            const target = this.file(repoId);
            const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
            const handle = await open(temp, "wx", 0o600);
            try {
                await handle.writeFile(JSON.stringify(review, null, 2) + "\n");
                await handle.sync();
            } finally {
                await handle.close();
            }
            await rename(temp, target);
            return copySnapshot(review);
        });
    }

    import(repoId: string, repoRoot: string, incoming: CommentMap): Promise<CommentSnapshot> {
        return this.mutate(repoId, repoRoot, (review) => {
            const known = new Set(
                Object.values(review.comments)
                    .flat()
                    .map((comment) => comment.id),
            );
            for (const [filePath, list] of Object.entries(incoming)) {
                for (const raw of list) {
                    const comment: DiffComment = {
                        ...raw,
                        author: raw.author ?? { kind: "user" },
                    };
                    if (!isComment(comment) || known.has(comment.id)) continue;
                    (review.comments[filePath] ??= []).push(comment);
                    known.add(comment.id);
                }
            }
        });
    }

    create(repoId: string, repoRoot: string, comment: DiffComment): Promise<CommentSnapshot> {
        return this.mutate(repoId, repoRoot, (review) => {
            if (!isComment(comment)) throw new Error("invalid comment");
            if (
                Object.values(review.comments)
                    .flat()
                    .some((item) => item.id === comment.id)
            ) {
                throw new Error("comment id already exists");
            }
            (review.comments[comment.filePath] ??= []).push(comment);
        });
    }

    update(repoId: string, repoRoot: string, id: string, body: string): Promise<CommentSnapshot> {
        return this.mutate(repoId, repoRoot, (review) => {
            const comment = Object.values(review.comments)
                .flat()
                .find((item) => item.id === id);
            if (!comment) throw new Error("comment not found");
            comment.body = body;
        });
    }

    delete(repoId: string, repoRoot: string, id: string): Promise<CommentSnapshot> {
        return this.mutate(repoId, repoRoot, (review) => {
            let found = false;
            for (const [filePath, list] of Object.entries(review.comments)) {
                const filtered = list.filter((item) => item.id !== id);
                found ||= filtered.length !== list.length;
                if (filtered.length) review.comments[filePath] = filtered;
                else delete review.comments[filePath];
            }
            if (!found) throw new Error("comment not found");
        });
    }
}
