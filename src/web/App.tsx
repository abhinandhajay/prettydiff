import { CommentsSidebar } from "@/components/CommentsSidebar";
import { EmptyState } from "@/components/EmptyState";
import { FileCard } from "@/components/FileCard";
import { FileTreeSidebar } from "@/components/FileTreeSidebar";
import { Header } from "@/components/Header";
import {
    allCommentIds,
    commentKey,
    formatCommentsForCopy,
    markStaleComments,
} from "@/lib/comments";
import { fetchDiff } from "@/lib/fetchDiff";
import { fileCardId } from "@/lib/slug";
import { sortFilesForTree } from "@/lib/treeSort";
import { usePersistedState } from "@/lib/usePersistedState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ViewMode } from "@/components/ViewToggle";
import type { CommentMap, DiffComment, DiffPayload, DraftLine } from "@/lib/types";

function makeId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `c_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export default function App() {
    const [payload, setPayload] = useState<DiffPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isReloading, setIsReloading] = useState(false);
    const [viewMode, setViewMode] = usePersistedState<ViewMode>("prettydiff:view", "unified");
    const [wrap, setWrap] = usePersistedState<boolean>("prettydiff:wrap", false);
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
    const [activePath, setActivePath] = useState<string | null>(null);

    const [comments, setComments] = usePersistedState<CommentMap>("prettydiff:comments", {});
    const [showCommentsSidebar, setShowCommentsSidebar] = usePersistedState<boolean>(
        "prettydiff:comments-open",
        true,
    );
    const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(new Set());
    const [activeDraft, setActiveDraft] = useState<DraftLine | null>(null);
    const [scrollToCommentId, setScrollToCommentId] = useState<string | null>(null);

    const commentsRef = useRef(comments);
    useEffect(() => {
        commentsRef.current = comments;
    }, [comments]);

    const loadDiff = useCallback(
        (mode: "initial" | "reload") => {
            if (mode === "reload") setIsReloading(true);
            fetchDiff()
                .then((p) => {
                    setPayload(p);
                    const stamped = markStaleComments(commentsRef.current, p.files);
                    if (stamped !== commentsRef.current) {
                        setComments(stamped);
                    }
                    if (mode === "initial") {
                        const init: Record<string, boolean> = {};
                        for (const f of p.files) init[f.path] = true;
                        setOpenMap(init);
                        if (p.files[0]) setActivePath(p.files[0].path);
                        setSelectedCommentIds(new Set(allCommentIds(stamped)));
                    } else {
                        const present = new Set(p.files.map((f) => f.path));
                        setOpenMap((prev) => {
                            const next: Record<string, boolean> = {};
                            for (const f of p.files) {
                                next[f.path] = prev[f.path] ?? true;
                            }
                            return next;
                        });
                        setActivePath((prev) =>
                            prev && present.has(prev) ? prev : (p.files[0]?.path ?? null),
                        );
                        setSelectedCommentIds((prev) => {
                            const next = new Set(prev);
                            for (const id of allCommentIds(stamped)) {
                                if (!next.has(id)) next.add(id);
                            }
                            const validIds = new Set(allCommentIds(stamped, true));
                            for (const id of Array.from(next)) {
                                if (!validIds.has(id)) next.delete(id);
                            }
                            return next;
                        });
                    }
                })
                .catch((e) => {
                    if (mode === "initial") setError(e?.message ?? String(e));
                    else console.warn("prettydiff: reload failed", e);
                })
                .finally(() => {
                    if (mode === "reload") setIsReloading(false);
                });
        },
        [setComments],
    );

    useEffect(() => {
        loadDiff("initial");
    }, [loadDiff]);

    const reload = useCallback(() => loadDiff("reload"), [loadDiff]);

    const setOpen = useCallback((path: string, open: boolean) => {
        setOpenMap((m) => ({ ...m, [path]: open }));
    }, []);

    const expandAll = useCallback(() => {
        if (!payload) return;
        const m: Record<string, boolean> = {};
        for (const f of payload.files) m[f.path] = true;
        setOpenMap(m);
    }, [payload]);

    const collapseAll = useCallback(() => {
        if (!payload) return;
        const m: Record<string, boolean> = {};
        for (const f of payload.files) m[f.path] = false;
        setOpenMap(m);
    }, [payload]);

    const scrollToFile = useCallback((path: string) => {
        setOpenMap((m) => (m[path] ? m : { ...m, [path]: true }));
        requestAnimationFrame(() => {
            const el = document.getElementById(fileCardId(path));
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }, []);

    useEffect(() => {
        if (!payload) return;
        const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-file-path]"));
        if (cards.length === 0) return;
        let raf = 0;
        const STICKY_OFFSET = 56;
        const compute = () => {
            raf = 0;
            let active: string | null = cards[0]?.dataset.filePath ?? null;
            for (const card of cards) {
                if (card.getBoundingClientRect().top - STICKY_OFFSET <= 1) {
                    active = card.dataset.filePath ?? active;
                } else {
                    break;
                }
            }
            if (active) setActivePath(active);
        };
        const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(compute);
        };
        schedule();
        window.addEventListener("scroll", schedule, { passive: true });
        const ro = new ResizeObserver(schedule);
        cards.forEach((c) => ro.observe(c));
        return () => {
            window.removeEventListener("scroll", schedule);
            ro.disconnect();
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, [payload]);

    const sortedFiles = useMemo(() => (payload ? sortFilesForTree(payload.files) : []), [payload]);

    const totalCommentCount = useMemo(
        () => Object.values(comments).reduce((n, list) => n + list.length, 0),
        [comments],
    );

    const requestDraft = useCallback((draft: DraftLine) => {
        setActiveDraft(draft);
    }, []);

    const cancelDraft = useCallback(() => {
        setActiveDraft(null);
    }, []);

    const saveDraft = useCallback(
        (body: string) => {
            if (!activeDraft) return;
            const trimmed = body.trim();
            if (!trimmed) return;
            const id = makeId();
            const comment: DiffComment = {
                id,
                filePath: activeDraft.filePath,
                side: activeDraft.side,
                lineNumber: activeDraft.lineNumber,
                lineType: activeDraft.lineType,
                lineText: activeDraft.lineText,
                body: trimmed,
                createdAt: Date.now(),
            };
            const prev = commentsRef.current;
            const existing = prev[activeDraft.filePath] ?? [];
            setComments({ ...prev, [activeDraft.filePath]: [...existing, comment] });
            setSelectedCommentIds((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
            });
            setActiveDraft(null);
            setShowCommentsSidebar(true);
        },
        [activeDraft, setComments, setShowCommentsSidebar],
    );

    const editComment = useCallback(
        (id: string, body: string) => {
            const prev = commentsRef.current;
            const next: CommentMap = {};
            for (const [path, list] of Object.entries(prev)) {
                next[path] = list.map((c) => (c.id === id ? { ...c, body } : c));
            }
            setComments(next);
        },
        [setComments],
    );

    const deleteComment = useCallback(
        (id: string) => {
            const prev = commentsRef.current;
            const next: CommentMap = {};
            for (const [path, list] of Object.entries(prev)) {
                const filtered = list.filter((c) => c.id !== id);
                if (filtered.length > 0) next[path] = filtered;
            }
            setComments(next);
            setSelectedCommentIds((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        },
        [setComments],
    );

    const toggleSelected = useCallback((id: string) => {
        setSelectedCommentIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleFileSelection = useCallback(
        (filePath: string, select: boolean) => {
            const list = comments[filePath] ?? [];
            setSelectedCommentIds((prev) => {
                const next = new Set(prev);
                for (const c of list) {
                    if (c.stale) continue;
                    if (select) next.add(c.id);
                    else next.delete(c.id);
                }
                return next;
            });
        },
        [comments],
    );

    const copySelected = useCallback(() => {
        if (!payload) return;
        const text = formatCommentsForCopy(selectedCommentIds, comments, payload);
        navigator.clipboard?.writeText(text).catch(() => {
            console.warn("prettydiff: failed to copy comments");
        });
    }, [comments, selectedCommentIds, payload]);

    const focusComment = useCallback(
        (id: string) => {
            setShowCommentsSidebar(true);
            setScrollToCommentId(id);
        },
        [setShowCommentsSidebar],
    );

    const clearScrollTarget = useCallback(() => setScrollToCommentId(null), []);

    // When a draft becomes active, ensure that file is expanded so the composer is visible.
    useEffect(() => {
        if (!activeDraft) return;
        setOpenMap((m) => (m[activeDraft.filePath] ? m : { ...m, [activeDraft.filePath]: true }));
    }, [activeDraft]);

    // If the active draft becomes a duplicate of an existing comment key, drop it.
    useEffect(() => {
        if (!activeDraft) return;
        const list = comments[activeDraft.filePath] ?? [];
        const k = commentKey(activeDraft);
        if (list.some((c) => !c.stale && commentKey(c) === k)) {
            setActiveDraft(null);
        }
    }, [comments, activeDraft]);

    if (error) {
        return <EmptyState kind="error" title="Couldn't load diff" message={error} />;
    }
    if (!payload) {
        return <EmptyState kind="loading" title="Loading…" />;
    }

    const gridCols = showCommentsSidebar ? "276px 1fr 320px" : "276px 1fr";

    return (
        <div className="bg-background flex min-h-screen flex-col">
            <Header
                payload={payload}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                wrap={wrap}
                onWrapChange={setWrap}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
                onReload={reload}
                isReloading={isReloading}
                showComments={showCommentsSidebar}
                onShowCommentsChange={setShowCommentsSidebar}
                commentCount={totalCommentCount}
            />
            {payload.files.length === 0 ? (
                <EmptyState kind="empty" title="No changes" message="Working tree matches HEAD." />
            ) : (
                <div className="relative grid flex-1" style={{ gridTemplateColumns: gridCols }}>
                    <FileTreeSidebar
                        files={sortedFiles}
                        activePath={activePath}
                        onScrollTo={scrollToFile}
                    />
                    <main className="space-y-3 px-5 py-5">
                        {sortedFiles.map((f) => (
                            <FileCard
                                key={f.path}
                                file={f}
                                open={openMap[f.path] ?? true}
                                onOpenChange={(o) => setOpen(f.path, o)}
                                viewMode={viewMode}
                                wrap={wrap}
                                comments={comments[f.path] ?? []}
                                activeDraft={
                                    activeDraft && activeDraft.filePath === f.path
                                        ? activeDraft
                                        : null
                                }
                                onRequestDraft={requestDraft}
                                onCancelDraft={cancelDraft}
                                onSaveDraft={saveDraft}
                                onFocusComment={focusComment}
                            />
                        ))}
                    </main>
                    {showCommentsSidebar ? (
                        <CommentsSidebar
                            comments={comments}
                            selectedIds={selectedCommentIds}
                            onToggleSelected={toggleSelected}
                            onToggleFile={toggleFileSelection}
                            onEdit={editComment}
                            onDelete={deleteComment}
                            onCopy={copySelected}
                            scrollToId={scrollToCommentId}
                            onScrollHandled={clearScrollTarget}
                        />
                    ) : null}
                </div>
            )}
        </div>
    );
}
