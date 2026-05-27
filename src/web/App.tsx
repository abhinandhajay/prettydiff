import { commentIndicatorDomId } from "@/components/CommentIndicator";
import { CommentsSidebar } from "@/components/CommentsSidebar";
import { EmptyState } from "@/components/EmptyState";
import { FileCard } from "@/components/FileCard";
import { FileTreeSidebar } from "@/components/FileTreeSidebar";
import { Header } from "@/components/Header";
import {
    allCommentIds,
    buildPatchIndex,
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
import type { PatchLineIndex } from "@/lib/comments";
import type { CommentMap, DiffComment, DiffPayload, DraftLine } from "@/lib/types";

const EMPTY_COMMENTS: DiffComment[] = [];
const EMPTY_PATCH_INDEX: PatchLineIndex = { additions: new Map(), deletions: new Map() };

export default function App() {
    const [payload, setPayload] = useState<DiffPayload | null>(null);
    const [patchIndexByPath, setPatchIndexByPath] = useState<Map<string, PatchLineIndex>>(
        () => new Map(),
    );
    const [error, setError] = useState<string | null>(null);
    const [isReloading, setIsReloading] = useState(false);
    const [viewMode, setViewMode] = usePersistedState<ViewMode>("prettydiff:view", "unified");
    const [wrap, setWrap] = usePersistedState<boolean>("prettydiff:wrap", false);
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
    const [activePath, setActivePath] = useState<string | null>(null);

    const [forceMountPath, setForceMountPath] = useState<string | null>(null);

    const [comments, setComments] = usePersistedState<CommentMap>("prettydiff:comments", {});
    const [showCommentsSidebar, setShowCommentsSidebar] = usePersistedState<boolean>(
        "prettydiff:comments-open",
        true,
    );
    const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(new Set());
    const [activeDraft, setActiveDraft] = useState<DraftLine | null>(null);
    const [scrollToCommentId, setScrollToCommentId] = useState<string | null>(null);
    const [diffFlashCommentId, setDiffFlashCommentId] = useState<string | null>(null);

    const mainRef = useRef<HTMLElement>(null);

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
                    const indexByPath = new Map<string, PatchLineIndex>();
                    for (const f of p.files) indexByPath.set(f.path, buildPatchIndex(f.rawPatch));
                    setPatchIndexByPath(indexByPath);
                    const stamped = markStaleComments(commentsRef.current, p.files, indexByPath);
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
                            const validIds = new Set(allCommentIds(stamped, true));
                            const next = new Set<string>();
                            for (const id of prev) {
                                if (validIds.has(id)) next.add(id);
                            }
                            for (const id of allCommentIds(stamped)) {
                                next.add(id);
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
        const main = mainRef.current;
        if (!main) return;
        const cards = Array.from(main.querySelectorAll<HTMLElement>("[data-file-path]"));
        if (cards.length === 0) return;

        const visible = new Map<string, DOMRectReadOnly>();
        const recompute = () => {
            if (visible.size === 0) return;
            let topPath: string | null = null;
            let topY = Infinity;
            for (const [path, rect] of visible) {
                if (rect.top < topY) {
                    topY = rect.top;
                    topPath = path;
                }
            }
            if (topPath) setActivePath(topPath);
        };

        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    const path = (e.target as HTMLElement).dataset.filePath;
                    if (!path) continue;
                    if (e.isIntersecting) visible.set(path, e.boundingClientRect);
                    else visible.delete(path);
                }
                recompute();
            },
            { root: main, rootMargin: "0px 0px -85% 0px", threshold: [0, 1] },
        );
        cards.forEach((c) => io.observe(c));
        return () => io.disconnect();
    }, [payload]);

    const commentsByPath = useMemo(() => {
        const m = new Map<string, DiffComment[]>();
        for (const [path, list] of Object.entries(comments)) m.set(path, list);
        return m;
    }, [comments]);

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
            const id = crypto.randomUUID();
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
            const current = commentsRef.current;
            const existing = current[activeDraft.filePath] ?? [];
            setComments({ ...current, [activeDraft.filePath]: [...existing, comment] });
            setSelectedCommentIds((selected) => {
                const next = new Set(selected);
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
            const current = commentsRef.current;
            const next: CommentMap = {};
            for (const [path, list] of Object.entries(current)) {
                next[path] = list.map((c) => (c.id === id ? { ...c, body } : c));
            }
            setComments(next);
        },
        [setComments],
    );

    const deleteComment = useCallback(
        (id: string) => {
            const current = commentsRef.current;
            const next: CommentMap = {};
            for (const [path, list] of Object.entries(current)) {
                const filtered = list.filter((c) => c.id !== id);
                if (filtered.length > 0) next[path] = filtered;
            }
            setComments(next);
            setSelectedCommentIds((selected) => {
                if (!selected.has(id)) return selected;
                const next = new Set(selected);
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

    const jumpToDiffComment = useCallback((id: string) => {
        let filePath: string | null = null;
        for (const [path, list] of Object.entries(commentsRef.current)) {
            if (list.some((c) => c.id === id)) {
                filePath = path;
                break;
            }
        }
        if (!filePath) return;
        setOpenMap((m) => (m[filePath!] ? m : { ...m, [filePath!]: true }));
        setForceMountPath(filePath);
        const cardEl = document.getElementById(fileCardId(filePath));
        cardEl?.scrollIntoView({ behavior: "smooth", block: "start" });
        setDiffFlashCommentId(id);
    }, []);

    useEffect(() => {
        if (!diffFlashCommentId) return;
        let cancelled = false;
        let attempts = 0;
        const tryScroll = () => {
            if (cancelled) return;
            const el = document.getElementById(commentIndicatorDomId(diffFlashCommentId));
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
            }
            if (attempts++ < 60) requestAnimationFrame(tryScroll);
        };
        requestAnimationFrame(tryScroll);
        const t = window.setTimeout(() => {
            setDiffFlashCommentId(null);
            setForceMountPath(null);
        }, 1800);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [diffFlashCommentId]);

    useEffect(() => {
        if (!activeDraft) return;
        const list = comments[activeDraft.filePath] ?? [];
        const k = commentKey(activeDraft);
        if (list.some((c) => !c.stale && commentKey(c) === k)) {
            setActiveDraft(null);
            return;
        }
        setOpenMap((m) => (m[activeDraft.filePath] ? m : { ...m, [activeDraft.filePath]: true }));
    }, [comments, activeDraft]);

    if (error) {
        return (
            <div className="bg-background flex min-h-screen flex-col">
                <EmptyState kind="error" title="Couldn't load diff" message={error} />
            </div>
        );
    }
    if (!payload) {
        return (
            <div className="bg-background flex min-h-screen flex-col">
                <EmptyState kind="loading" title="Loading…" />
            </div>
        );
    }

    return (
        <div className="bg-background flex h-screen flex-col overflow-hidden">
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
                <div
                    className="grid min-h-0 flex-1 transition-[grid-template-columns] duration-280 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{
                        gridTemplateColumns: `276px 1fr ${showCommentsSidebar ? "340px" : "0px"}`,
                    }}
                >
                    <FileTreeSidebar
                        files={sortedFiles}
                        activePath={activePath}
                        onScrollTo={scrollToFile}
                    />
                    <main ref={mainRef} className="min-h-0 overflow-y-auto">
                        <div className="space-y-3 px-5 py-5">
                            {sortedFiles.map((f) => (
                                <FileCard
                                    key={f.path}
                                    file={f}
                                    open={openMap[f.path] ?? true}
                                    onOpenChange={setOpen}
                                    viewMode={viewMode}
                                    wrap={wrap}
                                    comments={commentsByPath.get(f.path) ?? EMPTY_COMMENTS}
                                    patchIndex={patchIndexByPath.get(f.path) ?? EMPTY_PATCH_INDEX}
                                    activeDraft={
                                        activeDraft?.filePath === f.path ? activeDraft : null
                                    }
                                    forceMountBody={forceMountPath === f.path}
                                    onRequestDraft={requestDraft}
                                    onCancelDraft={cancelDraft}
                                    onSaveDraft={saveDraft}
                                    onFocusComment={focusComment}
                                    onEditComment={editComment}
                                    onDeleteComment={deleteComment}
                                    flashCommentId={diffFlashCommentId}
                                />
                            ))}
                        </div>
                    </main>
                    <div className="h-full overflow-hidden">
                        <CommentsSidebar
                            open={showCommentsSidebar}
                            comments={comments}
                            totalCount={totalCommentCount}
                            selectedIds={selectedCommentIds}
                            onToggleSelected={toggleSelected}
                            onToggleFile={toggleFileSelection}
                            onEdit={editComment}
                            onDelete={deleteComment}
                            onCopy={copySelected}
                            scrollToId={scrollToCommentId}
                            onScrollHandled={clearScrollTarget}
                            onJumpToDiff={jumpToDiffComment}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
