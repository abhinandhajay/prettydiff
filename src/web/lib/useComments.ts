import { useCallback, useEffect, useRef, useState } from "react";

import type { CommentMap, CommentSnapshot, DiffComment, DraftLine } from "@/lib/types";

interface Options {
    repoId?: string;
    target: "working-tree" | "branch";
    targetRef: string | null;
    includeWorkingTree: boolean;
}

interface PendingComment {
    comment: DiffComment;
    requestKey: string;
}

function addComment(comments: CommentMap, comment: DiffComment): CommentMap {
    return {
        ...comments,
        [comment.filePath]: [...(comments[comment.filePath] ?? []), comment],
    };
}

function removeComment(comments: CommentMap, id: string): CommentMap {
    const result: CommentMap = {};
    for (const [filePath, list] of Object.entries(comments)) {
        const remaining = list.filter((comment) => comment.id !== id);
        if (remaining.length) result[filePath] = remaining;
    }
    return result;
}

function mergePending(
    comments: CommentMap,
    pending: Map<string, PendingComment>,
    requestKey: string,
): CommentMap {
    let result = comments;
    const known = new Set(
        Object.values(comments).flatMap((list) => list.map((comment) => comment.id)),
    );
    for (const { comment, requestKey: pendingKey } of pending.values()) {
        if (pendingKey !== requestKey || known.has(comment.id)) continue;
        result = addComment(result, comment);
    }
    return result;
}

function query(options: Options): string {
    const params = new URLSearchParams({ target: options.target });
    if (options.repoId) params.set("repo", options.repoId);
    if (options.targetRef) params.set("targetRef", options.targetRef);
    if (!options.includeWorkingTree) params.set("includeWorkingTree", "0");
    return params.toString();
}

async function jsonRequest(
    url: string,
    init?: RequestInit,
): Promise<CommentSnapshot & { comment?: DiffComment }> {
    const response = await fetch(url, init);
    const body = (await response.json().catch(() => ({}))) as CommentSnapshot & {
        error?: string;
        comment?: DiffComment;
    };
    if (!response.ok) throw new Error(body.error ?? `request failed (${response.status})`);
    return body;
}

export function useComments(options: Options) {
    const [comments, setComments] = useState<CommentMap>({});
    const [error, setError] = useState<string | null>(null);
    const revisionRef = useRef<number | null>(null);
    const etagRef = useRef<string | null>(null);
    const pendingRef = useRef(new Map<string, PendingComment>());
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const load = useCallback(async (migrate = false) => {
        const current = optionsRef.current;
        const headers: HeadersInit = {};
        if (etagRef.current) headers["if-none-match"] = etagRef.current;
        const response = await fetch(`/api/comments?${query(current)}`, { headers });
        if (response.status === 304) return;
        const body = (await response.json().catch(() => ({}))) as CommentSnapshot & {
            error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? `request failed (${response.status})`);
        etagRef.current = response.headers.get("etag");
        revisionRef.current = body.revision;
        const requestKey = query(current);
        setComments(mergePending(body.comments, pendingRef.current, requestKey));
        setError(null);

        if (migrate) {
            const key = current.repoId
                ? `prettydiff:${current.repoId}:comments`
                : "prettydiff:comments";
            const raw = localStorage.getItem(key);
            if (raw) {
                const legacy = JSON.parse(raw) as CommentMap;
                const imported = await jsonRequest(`/api/comments/import?${query(current)}`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ comments: legacy }),
                });
                revisionRef.current = imported.revision;
                etagRef.current = null;
                setComments(mergePending(imported.comments, pendingRef.current, requestKey));
                localStorage.removeItem(key);
            }
        }
    }, []);

    useEffect(() => {
        etagRef.current = null;
        revisionRef.current = null;
        load(true).catch((cause: Error) => setError(cause.message));
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                load().catch((cause: Error) => setError(cause.message));
            }
        }, 2000);
        const onFocus = () => load().catch((cause: Error) => setError(cause.message));
        window.addEventListener("focus", onFocus);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", onFocus);
        };
    }, [load, options.repoId, options.target, options.targetRef, options.includeWorkingTree]);

    const create = useCallback((draft: DraftLine, body: string) => {
        const current = optionsRef.current;
        const requestKey = query(current);
        const comment: DiffComment = {
            id: crypto.randomUUID(),
            ...draft,
            body: body.trim(),
            createdAt: Date.now(),
            author: { kind: "user" },
        };
        pendingRef.current.set(comment.id, { comment, requestKey });
        setComments((existing) => addComment(existing, comment));
        setError(null);

        void jsonRequest(`/api/comments?${requestKey}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(comment),
        })
            .then((response) => {
                pendingRef.current.delete(comment.id);
                if (query(optionsRef.current) !== requestKey) return;
                revisionRef.current = response.revision;
                etagRef.current = null;
                setComments(mergePending(response.comments, pendingRef.current, requestKey));
                setError(null);
            })
            .catch((cause) => {
                pendingRef.current.delete(comment.id);
                if (query(optionsRef.current) !== requestKey) return;
                setComments((existing) => removeComment(existing, comment.id));
                setError((cause as Error).message);
            });

        return Promise.resolve(comment);
    }, []);

    const update = useCallback(async (id: string, body: string) => {
        try {
            const current = optionsRef.current;
            const response = await jsonRequest(
                `/api/comments/${encodeURIComponent(id)}?${query(current)}`,
                {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ body }),
                },
            );
            revisionRef.current = response.revision;
            etagRef.current = null;
            setComments(response.comments);
            setError(null);
        } catch (cause) {
            setError((cause as Error).message);
            throw cause;
        }
    }, []);

    const remove = useCallback(async (id: string) => {
        try {
            const current = optionsRef.current;
            const response = await jsonRequest(
                `/api/comments/${encodeURIComponent(id)}?${query(current)}`,
                {
                    method: "DELETE",
                    headers: { "content-type": "application/json" },
                    body: "{}",
                },
            );
            revisionRef.current = response.revision;
            etagRef.current = null;
            setComments(response.comments);
            setError(null);
        } catch (cause) {
            setError((cause as Error).message);
            throw cause;
        }
    }, []);

    const refresh = useCallback(() => {
        etagRef.current = null;
        return load();
    }, [load]);

    return { comments, error, refresh, create, update, remove };
}
