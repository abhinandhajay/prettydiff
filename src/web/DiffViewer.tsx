import { commentIndicatorDomId } from "@/components/CommentIndicator";
import { EmptyState } from "@/components/EmptyState";
import { FileCard } from "@/components/FileCard";
import { Header, HeaderShell } from "@/components/Header";
import {
    CollapsedReviewRail,
    ReviewSidebar,
    type ReviewSidebarTab,
} from "@/components/ReviewSidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
    allCommentIds,
    buildFileIndex,
    commentKey,
    formatCommentsForCopy,
    markStaleComments,
} from "@/lib/comments";
import { fetchDiff, FetchDiffError } from "@/lib/fetchDiff";
import { fileCardId } from "@/lib/slug";
import { sortFilesForTree } from "@/lib/treeSort";
import { usePersistedState } from "@/lib/usePersistedState";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { ViewMode } from "@/components/ViewToggle";
import type { PatchLineIndex } from "@/lib/comments";
import type {
    CommentMap,
    DiffComment,
    DiffPayload,
    DraftLine,
    ParsedFile,
    RepoInfo,
} from "@/lib/types";
import type * as React from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

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
const EAGER_DIFF_CARD_COUNT = 8;
const BACKGROUND_PRELOAD_CARD_BATCH = 2;
const BACKGROUND_PRELOAD_INTERVAL_MS = 900;
const ESTIMATED_DIFF_HEADER_HEIGHT = 56;
const ESTIMATED_DIFF_LINE_HEIGHT = 18;
const COLLAPSED_LEFT_PANEL_WIDTH = 52;
const LEFT_PANEL_COLLAPSE_TRIGGER_WIDTH = 104;
const DEFAULT_LEFT_PANEL_WIDTH = 340;
const MIN_LEFT_PANEL_WIDTH = 260;
const MAX_LEFT_PANEL_WIDTH = 480;

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

function clampLeftPanelWidth(width: number): number {
    return Math.min(MAX_LEFT_PANEL_WIDTH, Math.max(MIN_LEFT_PANEL_WIDTH, Math.round(width)));
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

// Smoothly scrolls `scroller` until `getOffset` (remaining distance to the
// target, or null while the target hasn't rendered) reaches zero. Re-measures
// every frame because lazy diff bodies use estimated heights until they
// render, so a one-shot scrollIntoView can land off target. Velocity is a
// low-pass filter over distance-proportional speed — smooth ramp-up, steady
// middle — but the step is clamped to never pass the target: unclamped, the
// filter is underdamped and rings around the destination. After landing it
// keeps watching until the frame cap, because lazy bodies can render after
// arrival and shift the target; aligned frames are no-ops. Any user scroll
// input cancels immediately. Returns a cancel function.
function animateScrollTo(scroller: HTMLElement, getOffset: () => number | null): () => void {
    let cancelled = false;
    let frames = 0;
    let missing = 0;
    let velocity = 0;
    const cancel = () => {
        cancelled = true;
        scroller.removeEventListener("wheel", cancel);
        scroller.removeEventListener("touchstart", cancel);
        scroller.removeEventListener("mousedown", cancel);
        scroller.removeEventListener("keydown", cancel);
    };
    scroller.addEventListener("wheel", cancel, { passive: true });
    scroller.addEventListener("touchstart", cancel, { passive: true });
    scroller.addEventListener("mousedown", cancel);
    scroller.addEventListener("keydown", cancel);
    const animate = () => {
        if (cancelled) return;
        if (frames++ > 240) {
            cancel();
            return;
        }
        const offset = getOffset();
        if (offset === null) {
            if (missing++ < 60) requestAnimationFrame(animate);
            else cancel();
            return;
        }
        if (Math.abs(offset) >= 0.5) {
            velocity = velocity * 0.78 + offset * 0.18 * 0.22;
            if (Math.abs(velocity) >= Math.abs(offset)) {
                velocity = 0;
                scroller.scrollTop += offset;
            } else {
                scroller.scrollTop += velocity;
            }
        } else {
            velocity = 0;
        }
        requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
    return cancel;
}

interface DiffViewerProps {
    repoId?: string;
    repos: RepoInfo[];
    onRepoChange: (id: string) => void;
    refreshRepos: () => void;
    onUnknownRepo: () => void;
    reconnecting: boolean;
}

// Per-repo state gets keys scoped by repo id; without an id (single-repo
// fallback against an old server) the legacy unscoped keys apply.
function storageKey(repoId: string | undefined, name: string): string {
    return repoId ? `prettydiff:${repoId}:${name}` : `prettydiff:${name}`;
}

export function DiffViewer({
    repoId,
    repos,
    onRepoChange,
    refreshRepos,
    onUnknownRepo,
    reconnecting,
}: DiffViewerProps) {
    const [payload, setPayload] = useState<DiffPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isReloading, setIsReloading] = useState(false);
    const [viewMode, setViewMode] = usePersistedState<ViewMode>("prettydiff:view", "unified");
    const [wrap, setWrap] = usePersistedState<boolean>("prettydiff:wrap", false);
    const [target, setTarget] = usePersistedState<"working-tree" | "branch">(
        storageKey(repoId, "target"),
        "working-tree",
    );
    const [targetRef, setTargetRef] = usePersistedState<string | null>(
        storageKey(repoId, "targetRef"),
        null,
    );
    const [includeWorkingTree, setIncludeWorkingTree] = usePersistedState<boolean>(
        storageKey(repoId, "includeWorkingTree"),
        true,
    );
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
    const [activePath, setActivePath] = useState<string | null>(null);

    const [comments, setComments] = usePersistedState<CommentMap>(
        storageKey(repoId, "comments"),
        {},
    );
    const [leftPanelOpen, setLeftPanelOpen] = usePersistedState<boolean>(
        "prettydiff:left-panel-open",
        true,
    );
    const [leftPanelTab, setLeftPanelTab] = usePersistedState<ReviewSidebarTab>(
        "prettydiff:left-panel-tab",
        "changes",
    );
    const [leftPanelSize, setLeftPanelSize] = usePersistedState<number>(
        "prettydiff:left-panel-size",
        DEFAULT_LEFT_PANEL_WIDTH,
    );
    const effectiveLeftPanelSize =
        leftPanelSize < MIN_LEFT_PANEL_WIDTH || leftPanelSize > MAX_LEFT_PANEL_WIDTH
            ? DEFAULT_LEFT_PANEL_WIDTH
            : leftPanelSize;
    const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(new Set());
    const [activeDraft, setActiveDraft] = useState<DraftLine | null>(null);
    const [fileRenderMeta, setFileRenderMeta] = useState<DiffRenderMeta>(EMPTY_RENDER_META);
    const [scrollToCommentId, setScrollToCommentId] = useState<string | null>(null);
    const [diffFlashCommentId, setDiffFlashCommentId] = useState<string | null>(null);
    const [largeDiffHint, setLargeDiffHint] = useState<{ files: number; lines: number } | null>(
        null,
    );
    const [mountReady, setMountReady] = useState(false);
    const [stagedDiffCardCount, setStagedDiffCardCount] = useState(EAGER_DIFF_CARD_COUNT);
    const [completedFilePaths, setCompletedFilePaths] = useState<Set<string>>(new Set());
    const [animatePanel, setAnimatePanel] = useState(false);

    const mainRef = useRef<HTMLElement>(null);
    const loadIdRef = useRef(0);
    const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
    const closedPanelDragActiveRef = useRef(false);
    const animateTimerRef = useRef<number | null>(null);
    const animatingRef = useRef(false);
    // Frozen at mount: if defaultSize/minSize tracked leftPanelOpen, flipping that
    // flag mid-drag would re-register the panel and freeze the gesture. Reopen width
    // is restored imperatively via resize() in setReviewPanelOpen instead.
    const panelDefaultSizeRef = useRef(
        leftPanelOpen ? `${effectiveLeftPanelSize}px` : `${COLLAPSED_LEFT_PANEL_WIDTH}px`,
    );

    const commentsRef = useRef(comments);
    useEffect(() => {
        commentsRef.current = comments;
    }, [comments]);

    const setReviewPanelOpen = useCallback(
        (open: boolean) => {
            setLeftPanelOpen(open);
            // Animate the panel width only for this programmatic open/collapse; an
            // always-on flex-grow transition makes interactive drags lag the cursor.
            // animatingRef silences onResize during the animation so the width
            // sweeping through the collapse threshold doesn't auto-collapse a reopen.
            setAnimatePanel(true);
            animatingRef.current = true;
            if (animateTimerRef.current !== null) window.clearTimeout(animateTimerRef.current);
            animateTimerRef.current = window.setTimeout(() => {
                setAnimatePanel(false);
                animatingRef.current = false;
            }, 340);
            window.requestAnimationFrame(() => {
                if (open) {
                    leftPanelRef.current?.resize(`${effectiveLeftPanelSize}px`);
                } else {
                    leftPanelRef.current?.collapse();
                }
            });
        },
        [effectiveLeftPanelSize, setLeftPanelOpen],
    );

    useEffect(
        () => () => {
            if (animateTimerRef.current !== null) window.clearTimeout(animateTimerRef.current);
        },
        [],
    );

    const startClosedPanelResize = useCallback(
        (event: React.PointerEvent<HTMLButtonElement>) => {
            if (leftPanelOpen) return;
            closedPanelDragActiveRef.current = true;

            const applySize = (clientX: number) => {
                const nextSize = clampLeftPanelWidth(clientX);
                setLeftPanelSize(nextSize);
                leftPanelRef.current?.resize(`${nextSize}px`);
            };
            const startSize = clampLeftPanelWidth(event.clientX);

            event.preventDefault();
            flushSync(() => {
                setLeftPanelSize(startSize);
                setLeftPanelOpen(true);
            });
            window.requestAnimationFrame(() => {
                leftPanelRef.current?.resize(`${startSize}px`);
            });

            const handlePointerMove = (moveEvent: PointerEvent) => {
                applySize(moveEvent.clientX);
            };
            const stopResize = () => {
                closedPanelDragActiveRef.current = false;
                window.removeEventListener("pointermove", handlePointerMove);
                window.removeEventListener("pointerup", stopResize);
                window.removeEventListener("pointercancel", stopResize);
            };

            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", stopResize);
            window.addEventListener("pointercancel", stopResize);
        },
        [leftPanelOpen, setLeftPanelOpen, setLeftPanelSize],
    );

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
                setStagedDiffCardCount(EAGER_DIFF_CARD_COUNT);
                setCompletedFilePaths(new Set());
                setLargeDiffHint(null);
            }
            fetchDiff({ target: requestTarget, targetRef, includeWorkingTree, repoId })
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
                    setStagedDiffCardCount(EAGER_DIFF_CARD_COUNT);
                    if (mode === "initial") {
                        setCompletedFilePaths(
                            new Set(
                                p.files.filter((file) => file.skipped).map((file) => file.path),
                            ),
                        );
                    }
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
                    if (e instanceof FetchDiffError && e.status === 404) {
                        // Unknown repo — likely mid-takeover before it re-registered,
                        // or its process exited. Let the root reselect a live repo.
                        onUnknownRepo();
                    }
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
        [setComments, target, targetRef, includeWorkingTree, repoId, onUnknownRepo],
    );

    useEffect(() => {
        loadDiff("initial");
    }, [loadDiff]);

    const reload = useCallback(() => {
        refreshRepos();
        loadDiff("reload");
    }, [loadDiff, refreshRepos]);

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
        fileScrollCancelRef.current = animateScrollTo(scroller, () => {
            const el = document.getElementById(fileCardId(path));
            if (!el) return null;
            return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        });
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
    const shouldStageDiffPreload = shouldShowLargeDiffHint(fileRenderMeta.totalLines);
    const eagerDiffCardCount = shouldStageDiffPreload ? stagedDiffCardCount : sortedFiles.length;
    const initialFilePaths = useMemo(
        () => sortedFiles.slice(0, EAGER_DIFF_CARD_COUNT).map((file) => file.path),
        [sortedFiles],
    );
    const completedInitialFileCount = initialFilePaths.reduce(
        (count, path) => count + (completedFilePaths.has(path) ? 1 : 0),
        0,
    );

    const allExpanded = useMemo(
        () => (payload ? payload.files.every((f) => openMap[f.path] ?? true) : true),
        [payload, openMap],
    );

    const totalCommentCount = useMemo(
        () => Object.values(comments).reduce((n, list) => n + list.length, 0),
        [comments],
    );

    const markFileRenderComplete = useCallback((path: string) => {
        setCompletedFilePaths((completed) => {
            if (completed.has(path)) return completed;
            const next = new Set(completed);
            next.add(path);
            return next;
        });
    }, []);

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
            setReviewPanelOpen(true);
            setLeftPanelTab("comments");
        },
        [activeDraft, setComments, setLeftPanelTab, setReviewPanelOpen],
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
            setReviewPanelOpen(true);
            setLeftPanelTab("comments");
            setScrollToCommentId(id);
        },
        [setLeftPanelTab, setReviewPanelOpen],
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
        const cancel = animateScrollTo(scroller, () => {
            const el = document.getElementById(commentIndicatorDomId(diffFlashCommentId));
            if (!el) return null;
            const sRect = scroller.getBoundingClientRect();
            const rect = el.getBoundingClientRect();
            return rect.top + rect.height / 2 - (sRect.top + sRect.height / 2);
        });
        const t = window.setTimeout(() => {
            setDiffFlashCommentId(null);
        }, 3000);
        return () => {
            cancel();
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
        if (completedInitialFileCount < initialFilePaths.length) return;
        setMountReady(true);
        setLargeDiffHint(null);
    }, [payload, largeDiffHint, completedInitialFileCount, initialFilePaths.length]);

    useEffect(() => {
        if (!payload) {
            setStagedDiffCardCount(EAGER_DIFF_CARD_COUNT);
            return;
        }
        if (!shouldStageDiffPreload) return;
        if (stagedDiffCardCount >= sortedFiles.length) return;
        const id = window.setTimeout(() => {
            setStagedDiffCardCount((count) =>
                Math.min(sortedFiles.length, count + BACKGROUND_PRELOAD_CARD_BATCH),
            );
        }, BACKGROUND_PRELOAD_INTERVAL_MS);
        return () => window.clearTimeout(id);
    }, [payload, shouldStageDiffPreload, stagedDiffCardCount, sortedFiles.length]);

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

    const diffContent = (
        <main ref={mainRef} className="bg-card h-full min-w-0 flex-1 overflow-y-auto">
            <div>
                {sortedFiles.map((f, index) => {
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
                            estimatedHeight={meta?.estimatedHeight ?? ESTIMATED_DIFF_HEADER_HEIGHT}
                            eager={index < eagerDiffCardCount}
                            activeDraft={activeDraft?.filePath === f.path ? activeDraft : null}
                            onRequestDraft={requestDraft}
                            onCancelDraft={cancelDraft}
                            onSaveDraft={saveDraft}
                            onFocusComment={focusComment}
                            onEditComment={editComment}
                            onDeleteComment={deleteComment}
                            flashCommentId={diffFlashCommentId}
                            onRenderComplete={markFileRenderComplete}
                        />
                    );
                })}
            </div>
        </main>
    );

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
                        ? `${largeDiffHint.files} files, ~${(largeDiffHint.lines / 1000).toFixed(1)}k lines.`
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
                repos={repos}
                selectedRepoId={repoId}
                onRepoChange={onRepoChange}
                reconnecting={reconnecting}
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
                includeWorkingTree={includeWorkingTree}
                onIncludeWorkingTreeChange={setIncludeWorkingTree}
            />
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
                {payload.files.length === 0 ? (
                    <EmptyState
                        kind="empty"
                        title="No changes"
                        message="Selected diff has no changes."
                    />
                ) : (
                    <ResizablePanelGroup
                        direction="horizontal"
                        className={cn(
                            "relative min-h-0 flex-1 overflow-hidden",
                            animatePanel && "resizable-panel-animated",
                        )}
                    >
                        <ResizablePanel
                            id="review-sidebar"
                            panelRef={leftPanelRef}
                            collapsible
                            collapsedSize={`${COLLAPSED_LEFT_PANEL_WIDTH}px`}
                            defaultSize={panelDefaultSizeRef.current}
                            minSize={`${MIN_LEFT_PANEL_WIDTH}px`}
                            maxSize={`${MAX_LEFT_PANEL_WIDTH}px`}
                            groupResizeBehavior="preserve-pixel-size"
                            onResize={(size) => {
                                if (animatingRef.current) return;
                                if (closedPanelDragActiveRef.current) return;
                                const pixelSize = Math.round(size.inPixels);
                                // Keep leftPanelOpen in sync with the live width in BOTH
                                // directions. A single drag can collapse the panel and then
                                // re-expand it; syncing only on collapse would leave the
                                // library panel wide while React still renders the 52px rail.
                                const nextOpen = pixelSize > LEFT_PANEL_COLLAPSE_TRIGGER_WIDTH;
                                if (nextOpen !== leftPanelOpen) setLeftPanelOpen(nextOpen);
                                if (nextOpen) {
                                    setLeftPanelSize(clampLeftPanelWidth(pixelSize));
                                }
                            }}
                            className="min-w-0 overflow-hidden"
                        >
                            {leftPanelOpen ? (
                                <ReviewSidebar
                                    open={leftPanelOpen}
                                    activeTab={leftPanelTab}
                                    onOpenChange={setReviewPanelOpen}
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
                                    onOpen={() => setReviewPanelOpen(true)}
                                    onResizeStart={startClosedPanelResize}
                                />
                            )}
                        </ResizablePanel>
                        <ResizableHandle
                            disabled={!leftPanelOpen}
                            withHandle={leftPanelOpen}
                            className="transition-colors"
                        />
                        <ResizablePanel id="diff-content" minSize="0px">
                            {diffContent}
                        </ResizablePanel>
                    </ResizablePanelGroup>
                )}
                {overlay}
            </div>
        </div>
    );
}
