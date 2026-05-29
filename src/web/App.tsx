import { CommentsSidebar } from "@/components/CommentsSidebar";
import { DiffCodeView } from "@/components/DiffCodeView";
import { EmptyState } from "@/components/EmptyState";
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
import { sortFilesForTree } from "@/lib/treeSort";
import { usePersistedState } from "@/lib/usePersistedState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { DiffCodeViewHandle } from "@/components/DiffCodeView";
import type { ViewMode } from "@/components/ViewToggle";
import type { PatchLineIndex } from "@/lib/comments";
import type { CommentMap, DiffComment, DiffPayload, DraftLine, ParsedFile } from "@/lib/types";

const HUGE_DIFF_LINE_THRESHOLD = 5000;

interface DiffRenderMeta {
    byPath: Map<string, PatchLineIndex>;
    totalLines: number;
}

const EMPTY_RENDER_META: DiffRenderMeta = { byPath: new Map(), totalLines: 0 };

function shouldShowLargeDiffHint(lineCount: number): boolean {
    return lineCount > HUGE_DIFF_LINE_THRESHOLD;
}

function yieldForPaint(): Promise<void> {
    return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
}

function buildRenderMeta(files: ParsedFile[]): DiffRenderMeta {
    const byPath = new Map<string, PatchLineIndex>();
    let totalLines = 0;
    for (const file of files) {
        totalLines += file.rawPatch.split("\n").length;
        byPath.set(file.path, buildPatchIndex(file.rawPatch));
    }
    return { byPath, totalLines };
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
    const [fileRenderMeta, setFileRenderMeta] = useState<DiffRenderMeta>(EMPTY_RENDER_META);
    const [scrollToCommentId, setScrollToCommentId] = useState<string | null>(null);
    const [diffFlashCommentId, setDiffFlashCommentId] = useState<string | null>(null);
    const [largeDiffHint, setLargeDiffHint] = useState<{ files: number; lines: number } | null>(
        null,
    );
    const [mountReady, setMountReady] = useState(false);

    const codeViewRef = useRef<DiffCodeViewHandle>(null);

    const commentsRef = useRef(comments);
    useEffect(() => {
        commentsRef.current = comments;
    }, [comments]);

    const loadDiff = useCallback(
        (mode: "initial" | "reload") => {
            if (mode === "reload") setIsReloading(true);
            if (mode === "initial") {
                setMountReady(false);
                setLargeDiffHint(null);
            }
            fetchDiff()
                .then(async (p) => {
                    const renderMeta = buildRenderMeta(p.files);
                    if (mode === "initial") {
                        if (shouldShowLargeDiffHint(renderMeta.totalLines)) {
                            // flushSync commits the hint immediately; double
                            // rAF guarantees a paint cycle happens before the
                            // mount blocks the main thread, so the user sees
                            // the message rather than just the generic spinner.
                            flushSync(() => {
                                setLargeDiffHint({
                                    files: p.files.length,
                                    lines: renderMeta.totalLines,
                                });
                            });
                            await yieldForPaint();
                        }
                    }
                    const stamped = markStaleComments(
                        commentsRef.current,
                        p.files,
                        renderMeta.byPath,
                    );
                    setPayload(p);
                    setFileRenderMeta(renderMeta);
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
                    if (mode === "initial") {
                        setLargeDiffHint(null);
                        setError(e?.message ?? String(e));
                    } else {
                        console.warn("prettydiff: reload failed", e);
                    }
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

    const toggleOpen = useCallback((path: string) => {
        setOpenMap((m) => ({ ...m, [path]: !(m[path] ?? true) }));
    }, []);

    const scrollToFile = useCallback((path: string) => {
        setOpenMap((m) => (m[path] ? m : { ...m, [path]: true }));
        requestAnimationFrame(() => {
            codeViewRef.current?.scrollToItem(path);
        });
    }, []);

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
        let target: { filePath: string; comment: DiffComment } | null = null;
        for (const [path, list] of Object.entries(commentsRef.current)) {
            const comment = list.find((c) => c.id === id);
            if (comment) {
                target = { filePath: path, comment };
                break;
            }
        }
        if (!target) return;
        const { filePath, comment } = target;
        setOpenMap((m) => (m[filePath] ? m : { ...m, [filePath]: true }));
        setDiffFlashCommentId(id);
        // Two frames so the (possibly just-expanded) item is laid out before
        // CodeView resolves the line's scroll position.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                codeViewRef.current?.scrollToLine(filePath, comment.lineNumber, comment.side);
            });
        });
    }, []);

    useEffect(() => {
        if (!diffFlashCommentId) return;
        const t = window.setTimeout(() => setDiffFlashCommentId(null), 3000);
        return () => window.clearTimeout(t);
    }, [diffFlashCommentId]);

    useEffect(() => {
        if (!payload) {
            setMountReady(false);
            return;
        }
        if (!largeDiffHint) {
            setMountReady(true);
            return;
        }
        // Large diff: keep the loading overlay up until the browser is fully
        // idle — mount commit, initial paint, content-visibility paint of
        // near-viewport cards, and any post-mount effects have all completed.
        type Win = Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (id: number) => void;
        };
        const win = window as Win;
        const markReady = () => {
            setMountReady(true);
            setLargeDiffHint(null);
        };
        if (typeof win.requestIdleCallback === "function") {
            const id = win.requestIdleCallback(markReady, { timeout: 1500 });
            return () => win.cancelIdleCallback?.(id);
        }
        const id = window.setTimeout(markReady, 300);
        return () => window.clearTimeout(id);
    }, [payload, largeDiffHint]);

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

    const overlayVisible = !payload || !mountReady;
    const overlay = (
        <div
            aria-hidden={!overlayVisible}
            className="bg-background absolute inset-0 z-50 flex flex-col transition-opacity duration-200"
            style={{
                opacity: overlayVisible ? 1 : 0,
                pointerEvents: overlayVisible ? "auto" : "none",
            }}
        >
            <EmptyState
                kind="loading"
                title={largeDiffHint ? "Preparing large diff…" : "Loading…"}
                message={
                    largeDiffHint
                        ? `${largeDiffHint.files} files, ~${(largeDiffHint.lines / 1000).toFixed(1)}k lines. This may take a moment.`
                        : undefined
                }
            />
        </div>
    );

    if (!payload) {
        return <div className="bg-background relative flex min-h-screen flex-col">{overlay}</div>;
    }

    return (
        <div className="bg-background relative flex h-screen flex-col overflow-hidden">
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
                    <main className="min-h-0 overflow-hidden">
                        <DiffCodeView
                            ref={codeViewRef}
                            files={sortedFiles}
                            viewMode={viewMode}
                            wrap={wrap}
                            comments={comments}
                            openMap={openMap}
                            patchIndexByPath={fileRenderMeta.byPath}
                            activeDraft={activeDraft}
                            onToggleOpen={toggleOpen}
                            onRequestDraft={requestDraft}
                            onCancelDraft={cancelDraft}
                            onSaveDraft={saveDraft}
                            onFocusComment={focusComment}
                            onEditComment={editComment}
                            onDeleteComment={deleteComment}
                            flashCommentId={diffFlashCommentId}
                            onActivePathChange={setActivePath}
                        />
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
            {overlay}
        </div>
    );
}
