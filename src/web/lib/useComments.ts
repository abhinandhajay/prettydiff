import { commentsForPath } from "@/lib/comments";
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

const EMPTY_COMMENTS: CommentMap = {};

function addComment(comments: CommentMap, comment: DiffComment): CommentMap {
    return {
        ...comments,
        [comment.filePath]: [...commentsForPath(comments, comment.filePath), comment],
    };
}

function removeComment(comments: CommentMap, id: string): CommentMap {
    const result: CommentMap = {};
    for (const [filePath, list] of Object.entries(comments)) {
        const remaining = list.filter((comment) => comment.id !== id);
        if (remaining.length) {
            Object.defineProperty(result, filePath, {
                value: remaining,
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
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
    const [loadedScope, setLoadedScope] = useState<string | null>(null);
    const revisionRef = useRef<number | null>(null);
    const etagRef = useRef<string | null>(null);
    const pendingRef = useRef(new Map<string, PendingComment>());
    const migratedLegacyKeysRef = useRef(new Set<string>());
    const optionsRef = useRef(options);
    const activeScopeRef = useRef(query(options));
    const loadSerialRef = useRef(0);
    const appliedLoadSerialRef = useRef(0);
    optionsRef.current = options;
    const scope = query(options);
    if (activeScopeRef.current !== scope) {
        activeScopeRef.current = scope;
        revisionRef.current = null;
        etagRef.current = null;
        appliedLoadSerialRef.current = 0;
    }

    const applySnapshot = useCallback(
        (snapshot: CommentSnapshot, requestKey: string, loadSerial?: number, markLoaded = true) => {
            if (activeScopeRef.current !== requestKey) return false;
            if (loadSerial !== undefined && loadSerial < appliedLoadSerialRef.current) return false;
            if (revisionRef.current !== null && snapshot.revision < revisionRef.current) {
                return false;
            }
            if (loadSerial !== undefined) appliedLoadSerialRef.current = loadSerial;
            revisionRef.current = snapshot.revision;
            setComments(mergePending(snapshot.comments, pendingRef.current, requestKey));
            if (markLoaded) setLoadedScope(requestKey);
            setError(null);
            return true;
        },
        [],
    );

    const load = useCallback(
        async (retryMigration = true) => {
            const current = optionsRef.current;
            const requestKey = query(current);
            const legacyKey = current.repoId
                ? `prettydiff:${current.repoId}:comments`
                : "prettydiff:comments";
            const migrate = retryMigration && !migratedLegacyKeysRef.current.has(legacyKey);
            const loadSerial = ++loadSerialRef.current;
            const headers: HeadersInit = {};
            if (!migrate && etagRef.current) headers["if-none-match"] = etagRef.current;
            try {
                const response = await fetch(`/api/comments?${requestKey}`, { headers });
                if (activeScopeRef.current !== requestKey) return;
                if (response.status === 304) {
                    if (loadSerial < appliedLoadSerialRef.current) return;
                    appliedLoadSerialRef.current = loadSerial;
                    setLoadedScope(requestKey);
                    setError(null);
                    return;
                }
                const body = (await response.json().catch(() => ({}))) as CommentSnapshot & {
                    error?: string;
                };
                if (!response.ok)
                    throw new Error(body.error ?? `request failed (${response.status})`);
                if (!applySnapshot(body, requestKey, loadSerial, !migrate)) return;
                etagRef.current = response.headers.get("etag");

                if (migrate) {
                    const raw = localStorage.getItem(legacyKey);
                    if (raw) {
                        let legacy: CommentMap;
                        try {
                            legacy = JSON.parse(raw) as CommentMap;
                        } catch {
                            localStorage.removeItem(legacyKey);
                            migratedLegacyKeysRef.current.add(legacyKey);
                            setLoadedScope(requestKey);
                            return;
                        }
                        let imported: CommentSnapshot;
                        try {
                            imported = await jsonRequest(`/api/comments/import?${requestKey}`, {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ comments: legacy }),
                            });
                        } catch (cause) {
                            setLoadedScope(requestKey);
                            throw cause;
                        }
                        localStorage.removeItem(legacyKey);
                        migratedLegacyKeysRef.current.add(legacyKey);
                        if (applySnapshot(imported, requestKey)) etagRef.current = null;
                    } else {
                        migratedLegacyKeysRef.current.add(legacyKey);
                        setLoadedScope(requestKey);
                    }
                }
            } catch (cause) {
                if (activeScopeRef.current === requestKey) setError((cause as Error).message);
                throw cause;
            }
        },
        [applySnapshot],
    );

    useEffect(() => {
        setLoadedScope(null);
        load().catch(() => {});
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                load().catch(() => {});
            }
        }, 2000);
        const onFocus = () => load().catch(() => {});
        window.addEventListener("focus", onFocus);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", onFocus);
        };
    }, [load, options.repoId, options.target, options.targetRef, options.includeWorkingTree]);

    const create = useCallback(
        (draft: DraftLine, body: string) => {
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
                    if (applySnapshot(response, requestKey)) etagRef.current = null;
                })
                .catch((cause) => {
                    pendingRef.current.delete(comment.id);
                    if (query(optionsRef.current) !== requestKey) return;
                    setComments((existing) => removeComment(existing, comment.id));
                    setError((cause as Error).message);
                });

            return Promise.resolve(comment);
        },
        [applySnapshot],
    );

    const update = useCallback(
        async (id: string, body: string) => {
            const current = optionsRef.current;
            const requestKey = query(current);
            try {
                const response = await jsonRequest(
                    `/api/comments/${encodeURIComponent(id)}?${requestKey}`,
                    {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ body }),
                    },
                );
                if (applySnapshot(response, requestKey)) etagRef.current = null;
            } catch (cause) {
                if (activeScopeRef.current === requestKey) setError((cause as Error).message);
                throw cause;
            }
        },
        [applySnapshot],
    );

    const remove = useCallback(
        async (id: string) => {
            const current = optionsRef.current;
            const requestKey = query(current);
            try {
                const response = await jsonRequest(
                    `/api/comments/${encodeURIComponent(id)}?${requestKey}`,
                    {
                        method: "DELETE",
                        headers: { "content-type": "application/json" },
                        body: "{}",
                    },
                );
                if (applySnapshot(response, requestKey)) etagRef.current = null;
            } catch (cause) {
                if (activeScopeRef.current === requestKey) setError((cause as Error).message);
                throw cause;
            }
        },
        [applySnapshot],
    );

    const refresh = useCallback(() => {
        etagRef.current = null;
        return load();
    }, [load]);

    const loaded = loadedScope === scope;
    return {
        comments: loaded ? comments : EMPTY_COMMENTS,
        error,
        loaded,
        refresh,
        create,
        update,
        remove,
    };
}
