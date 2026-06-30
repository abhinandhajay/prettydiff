import { commentIndicatorDomId } from "@/components/CommentIndicator";
import { EmptyState } from "@/components/EmptyState";
import { FileCard } from "@/components/FileCard";
import { Header, HeaderShell } from "@/components/Header";
import {
    CollapsedReviewRail,
    ReviewSidebar,
    type ReviewSidebarTab,
} from "@/components/ReviewSidebar";
import {
    allCommentIds,
    buildFileIndex,
    commentKey,
    formatCommentsForCopy,
    markStaleComments,
} from "@/lib/comments";
import { fetchDiff } from "@/lib/fetchDiff";
import { fileCardId } from "@/lib/slug";
import { sortFilesForTree } from "@/lib/treeSort";
import { usePersistedState } from "@/lib/usePersistedState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { ViewMode } from "@/components/ViewToggle";
import type { PatchLineIndex } from "@/lib/comments";
import type { CommentMap, DiffComment, DiffPayload, DraftLine, ParsedFile } from "@/lib/types";

const EMPTY_COMMENTS: DiffComment[] = [];
const EMPTY_PATCH_INDEX: PatchLineIndex = {
    additions: new Map(),
    deletions: new Map(),
    changedAdditions: new Set(),
    changedDeletions: new Set(),
    patchAdditions: new Set(),
    patchDeletions: new Set(),
};
const HUGE_DIFF_LINE_THRESHOLD = 5000;
const ESTIMATED_DIFF_HEADER_HEIGHT = 56;
const ESTIMATED_DIFF_LINE_HEIGHT = 18;

interface DiffFileRenderMeta {
    estimatedHeight: number;
    patchIndex: PatchLineIndex;
}

interface DiffRenderMeta {
    byPath: Map<string, DiffFileRenderMeta>;
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
    const byPath = new Map<string, DiffFileRenderMeta>();
    let totalLines = 0;
    for (const file of files) {
        const lineCount = file.rawPatch.split("\n").length;
        totalLines += lineCount;
        byPath.set(file.path, {
            estimatedHeight: ESTIMATED_DIFF_HEADER_HEIGHT + lineCount * ESTIMATED_DIFF_LINE_HEIGHT,
            patchIndex: buildFileIndex(file),
        });
    }
    return { byPath, totalLines };
}

function patchIndexesFromMeta(metaByPath: DiffRenderMeta["byPath"]): Map<string, PatchLineIndex> {
    const indexes = new Map<string, PatchLineIndex>();
    for (const [path, meta] of metaByPath) indexes.set(path, meta.patchIndex);
    return indexes;
}

export default function App() {
    const [payload, setPayload] = useState<DiffPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isReloading, setIsReloading] = useState(false);
    const [viewMode, setViewMode] = usePersistedState<ViewMode>("prettydiff:view", "unified");
    const [wrap, setWrap] = usePersistedState<boolean>("prettydiff:wrap", false);
    const [target, setTarget] = usePersistedState<"working-tree" | "branch">(
        "prettydiff:target",
        "working-tree",
    );
    const [targetRef, setTargetRef] = usePersistedState<string | null>(
        "prettydiff:targetRef",
        null,
    );
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
    const [activePath, setActivePath] = useState<string | null>(null);

    const [comments, setComments] = usePersistedState<CommentMap>("prettydiff:comments", {});
    const [leftPanelOpen, setLeftPanelOpen] = usePersistedState<boolean>(
        "prettydiff:left-panel-open",
        true,
    );
    const [leftPanelTab, setLeftPanelTab] = usePersistedState<ReviewSidebarTab>(
        "prettydiff:left-panel-tab",
        "changes",
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

    const mainRef = useRef<HTMLElement>(null);
    const loadIdRef = useRef(0);

    const commentsRef = useRef(comments);
    useEffect(() => {
        commentsRef.current = comments;
    }, [comments]);

    useEffect(() => {
        if (target === "branch" && !targetRef) setTarget("working-tree");
    }, [setTarget, target, targetRef]);

    const loadDiff = useCallback(
        (mode: "initial" | "reload") => {
            const loadId = ++loadIdRef.current;
            const requestTarget = target === "branch" && !targetRef ? "working-tree" : target;
            if (mode === "reload") setIsReloading(true);
            if (mode === "initial") {
                setIsReloading(false);
                setMountReady(false);
                setLargeDiffHint(null);
            }
            fetchDiff({ target: requestTarget, targetRef })
                .then(async (p) => {
                    if (loadId !== loadIdRef.current) return;
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
                            if (loadId !== loadIdRef.current) return;
                        }
                    }
                    const indexByPath = patchIndexesFromMeta(renderMeta.byPath);
                    const stamped = markStaleComments(commentsRef.current, p.files, indexByPath);
                    if (loadId !== loadIdRef.current) return;
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
                    if (loadId !== loadIdRef.current) return;
                    if (mode === "initial") {
                        setLargeDiffHint(null);
                        setError(e?.message ?? String(e));
                    } else {
                        console.warn("prettydiff: reload failed", e);
                    }
                })
                .finally(() => {
                    if (loadId !== loadIdRef.current) return;
                    if (mode === "reload") setIsReloading(false);
                });
        },
        [setComments, target, targetRef],
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

    const fileScrollCancelRef = useRef<(() => void) | null>(null);
    const scrollToFile = useCallback((path: string) => {
        setOpenMap((m) => (m[path] ? m : { ...m, [path]: true }));
        const scroller = mainRef.current;
        if (!scroller) return;
        // Cancel any in-flight file scroll so rapid clicks don't fight.
        fileScrollCancelRef.current?.();
        let cancelled = false;
        fileScrollCancelRef.current = () => {
            cancelled = true;
        };
        // Re-measure every frame and drive the card's top to the scroller's top.
        // The cards use content-visibility, so off-screen intrinsic heights are
        // only estimates until a card renders — a one-shot scrollIntoView lands
        // off when those estimates differ from the real diff height. Re-targeting
        // each frame converges to the exact position regardless. Same velocity-
        // smoothed easing as the comment jump below.
        let frames = 0;
        let settle = 0;
        let velocity = 0;
        const animate = () => {
            if (cancelled || frames++ > 240) return;
            const el = document.getElementById(fileCardId(path));
            if (!el) {
                if (frames < 60) requestAnimationFrame(animate);
                return;
            }
            const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
            if (Math.abs(offset) < 0.5 && Math.abs(velocity) < 0.3) {
                if (++settle > 3) return;
            } else {
                settle = 0;
            }
            const targetVelocity = offset * 0.18;
            velocity = velocity * 0.78 + targetVelocity * 0.22;
            scroller.scrollTop += velocity;
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, []);

    useEffect(() => () => fileScrollCancelRef.current?.(), []);

    useEffect(() => {
        if (!payload) return;
        const main = mainRef.current;
        if (!main) return;
        const cards = Array.from(main.querySelectorAll<HTMLElement>("[data-file-path]"));
        if (cards.length === 0) return;
        let raf = 0;
        const stickyOffset = main.getBoundingClientRect().top;
        const compute = () => {
            raf = 0;
            let active: string | null = cards[0]?.dataset.filePath ?? null;
            for (const card of cards) {
                if (card.getBoundingClientRect().top - stickyOffset <= 1) {
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
        main.addEventListener("scroll", schedule, { passive: true });
        const ro = new ResizeObserver(schedule);
        cards.forEach((c) => ro.observe(c));
        return () => {
            main.removeEventListener("scroll", schedule);
            ro.disconnect();
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, [payload]);

    const sortedFiles = useMemo(() => (payload ? sortFilesForTree(payload.files) : []), [payload]);

    const allExpanded = useMemo(
        () => (payload ? payload.files.every((f) => openMap[f.path] ?? true) : true),
        [payload, openMap],
    );

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
            setLeftPanelOpen(true);
            setLeftPanelTab("comments");
        },
        [activeDraft, setComments, setLeftPanelOpen, setLeftPanelTab],
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
            setLeftPanelOpen(true);
            setLeftPanelTab("comments");
            setScrollToCommentId(id);
        },
        [setLeftPanelOpen, setLeftPanelTab],
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
        setDiffFlashCommentId(id);
    }, []);

    useEffect(() => {
        if (!diffFlashCommentId) return;
        const scroller = mainRef.current;
        if (!scroller) return;
        let cancelled = false;
        let attempts = 0;
        let frames = 0;
        let velocity = 0;
        const findEl = () => document.getElementById(commentIndicatorDomId(diffFlashCommentId));
        // Velocity-smoothed reactive easing. Each frame's target velocity is
        // proportional to remaining distance; actual velocity is a low-pass-
        // filtered version, so motion ramps up smoothly at the start, holds
        // a steady pace, and decelerates gently at the end — instead of
        // pure exponential decay's snappy start and crawling tail.
        const animate = () => {
            if (cancelled || frames++ > 240) return;
            const el = findEl();
            if (!el) {
                if (attempts++ < 60) requestAnimationFrame(animate);
                return;
            }
            const sRect = scroller.getBoundingClientRect();
            const rect = el.getBoundingClientRect();
            const offset = rect.top + rect.height / 2 - (sRect.top + sRect.height / 2);
            const targetVelocity = offset * 0.18;
            velocity = velocity * 0.78 + targetVelocity * 0.22;
            if (Math.abs(offset) < 0.5 && Math.abs(velocity) < 0.3) return;
            scroller.scrollTop += velocity;
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
        const t = window.setTimeout(() => {
            setDiffFlashCommentId(null);
        }, 3000);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
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
        return (
            <div className="bg-background flex h-screen flex-col overflow-hidden">
                <HeaderShell />
                <div className="relative min-h-0 flex-1">{overlay}</div>
            </div>
        );
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
                allExpanded={allExpanded}
                onReload={reload}
                isReloading={isReloading}
                target={target}
                onTargetChange={setTarget}
                targetRef={targetRef ?? payload.targetRef}
                onTargetRefChange={setTargetRef}
            />
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
                {payload.files.length === 0 ? (
                    <EmptyState
                        kind="empty"
                        title="No changes"
                        message="Selected diff has no changes."
                    />
                ) : (
                    <div className="relative flex min-h-0 flex-1 overflow-hidden">
                        <div
                            className="h-full shrink-0 overflow-hidden"
                            style={{
                                width: leftPanelOpen ? "clamp(260px, 28vw, 340px)" : "52px",
                                transition: "width 280ms cubic-bezier(0.32, 0.72, 0, 1)",
                            }}
                        >
                            {leftPanelOpen ? (
                                <ReviewSidebar
                                    open={leftPanelOpen}
                                    activeTab={leftPanelTab}
                                    onOpenChange={setLeftPanelOpen}
                                    onTabChange={setLeftPanelTab}
                                    files={sortedFiles}
                                    activePath={activePath}
                                    onScrollToFile={scrollToFile}
                                    comments={comments}
                                    totalCommentCount={totalCommentCount}
                                    selectedCommentIds={selectedCommentIds}
                                    onToggleSelectedComment={toggleSelected}
                                    onToggleFileComments={toggleFileSelection}
                                    onEditComment={editComment}
                                    onDeleteComment={deleteComment}
                                    onCopyComments={copySelected}
                                    scrollToCommentId={scrollToCommentId}
                                    onCommentScrollHandled={clearScrollTarget}
                                    onJumpToDiffComment={jumpToDiffComment}
                                />
                            ) : (
                                <CollapsedReviewRail
                                    files={sortedFiles}
                                    totalCommentCount={totalCommentCount}
                                    onOpen={() => setLeftPanelOpen(true)}
                                />
                            )}
                        </div>
                        <main ref={mainRef} className="bg-card min-w-0 flex-1 overflow-y-auto">
                            <div>
                                {sortedFiles.map((f) => {
                                    const meta = fileRenderMeta.byPath.get(f.path);
                                    return (
                                        <FileCard
                                            key={f.path}
                                            file={f}
                                            open={openMap[f.path] ?? true}
                                            onOpenChange={setOpen}
                                            viewMode={viewMode}
                                            wrap={wrap}
                                            comments={comments[f.path] ?? EMPTY_COMMENTS}
                                            patchIndex={meta?.patchIndex ?? EMPTY_PATCH_INDEX}
                                            estimatedHeight={meta?.estimatedHeight ?? 0}
                                            activeDraft={
                                                activeDraft?.filePath === f.path
                                                    ? activeDraft
                                                    : null
                                            }
                                            onRequestDraft={requestDraft}
                                            onCancelDraft={cancelDraft}
                                            onSaveDraft={saveDraft}
                                            onFocusComment={focusComment}
                                            onEditComment={editComment}
                                            onDeleteComment={deleteComment}
                                            flashCommentId={diffFlashCommentId}
                                        />
                                    );
                                })}
                            </div>
                        </main>
                    </div>
                )}
                {overlay}
            </div>
        </div>
    );
}
