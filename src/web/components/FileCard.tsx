import { CommentComposer } from "@/components/CommentComposer";
import { CommentIndicator } from "@/components/CommentIndicator";
import { DiffErrorBoundary } from "@/components/DiffErrorBoundary";
import { LazyDiffBody } from "@/components/LazyDiffBody";
import { SkippedPreview } from "@/components/SkippedPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import { commentKey, commentsByKey } from "@/lib/comments";
import { fileCardId } from "@/lib/slug";
import { MultiFileDiff } from "@pierre/diffs/react";
import {
    ArrowRight,
    ChevronDown,
    ChevronRight,
    Copy,
    FileBox,
    FileMinus,
    FilePen,
    FilePlus,
    Plus,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import type { ViewMode } from "@/components/ViewToggle";
import type { PatchLineIndex } from "@/lib/comments";
import type {
    CommentLineType,
    CommentSide,
    DiffComment,
    DraftLine,
    FileStatus,
    ParsedFile,
} from "@/lib/types";
import type { DiffLineAnnotation } from "@pierre/diffs";

function GutterAddButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                width: "calc(1lh - 2px)",
                height: "calc(1lh - 2px)",
                marginRight: "calc(1ch - 1lh + 1px)",
                marginTop: "1px",
                boxShadow:
                    "0 0 0 1px color-mix(in oklab, var(--color-primary) 65%, transparent), 0 2px 6px -2px color-mix(in oklab, var(--color-primary) 50%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.18)",
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 relative z-5 inline-flex shrink-0 items-center justify-center rounded-sm transition-[transform,background-color] duration-100 ease-out hover:scale-105 active:scale-95"
            title="Add comment to this line"
            aria-label="Add comment to this line"
        >
            <Plus className="size-3" strokeWidth={3} />
        </button>
    );
}

type AnnotationMeta = { kind: "draft" } | { kind: "existing"; comment: DiffComment };

interface Props {
    file: ParsedFile;
    open: boolean;
    onOpenChange: (path: string, open: boolean) => void;
    viewMode: ViewMode;
    wrap: boolean;
    comments: DiffComment[];
    patchIndex: PatchLineIndex;
    estimatedHeight: number;
    activeDraft: DraftLine | null;
    onRequestDraft: (draft: DraftLine) => void;
    onCancelDraft: () => void;
    onSaveDraft: (body: string) => void;
    onFocusComment: (id: string) => void;
    onEditComment: (id: string, body: string) => void;
    onDeleteComment: (id: string) => void;
    flashCommentId: string | null;
}

const STATUS_VARIANT: Record<
    FileStatus,
    "success" | "destructive" | "secondary" | "warning" | "outline"
> = {
    added: "success",
    modified: "secondary",
    deleted: "destructive",
    renamed: "outline",
    untracked: "warning",
};

function StatusIcon({ status }: { status: FileStatus }) {
    const cls = "size-3.5";
    if (status === "added") return <FilePlus className={cls} />;
    if (status === "deleted") return <FileMinus className={cls} />;
    if (status === "renamed") return <ArrowRight className={cls} />;
    if (status === "untracked") return <FileBox className={cls} />;
    return <FilePen className={cls} />;
}

function splitPath(path: string): { dir: string; base: string } {
    const idx = path.lastIndexOf("/");
    if (idx === -1) return { dir: "", base: path };
    return { dir: path.slice(0, idx + 1), base: path.slice(idx + 1) };
}

function deriveLineType(
    index: PatchLineIndex,
    side: CommentSide,
    lineNumber: number,
): { lineType: CommentLineType; lineText: string } | null {
    if (side === "additions") {
        const text = index.additions.get(lineNumber);
        if (text === undefined) return null;
        if (index.changedAdditions.has(lineNumber)) {
            return { lineType: "change-addition", lineText: text };
        }
        const lineType = index.patchAdditions.has(lineNumber) ? "context" : "context-expanded";
        return { lineType, lineText: text };
    }
    const text = index.deletions.get(lineNumber);
    if (text === undefined) return null;
    if (index.changedDeletions.has(lineNumber)) {
        return { lineType: "change-deletion", lineText: text };
    }
    const lineType = index.patchDeletions.has(lineNumber) ? "context" : "context-expanded";
    return { lineType, lineText: text };
}

function FileCardImpl({
    file,
    open,
    onOpenChange,
    viewMode,
    wrap,
    comments,
    patchIndex,
    estimatedHeight,
    activeDraft,
    onRequestDraft,
    onCancelDraft,
    onSaveDraft,
    onFocusComment,
    onEditComment,
    onDeleteComment,
    flashCommentId,
}: Props) {
    const { dir, base } = splitPath(file.path);

    const handleOpenChange = useCallback(
        (next: boolean) => onOpenChange(file.path, next),
        [file.path, onOpenChange],
    );

    const lineAnnotations = useMemo<DiffLineAnnotation<AnnotationMeta>[]>(() => {
        const grouped = commentsByKey(comments.filter((c) => !c.stale));
        const annotations: DiffLineAnnotation<AnnotationMeta>[] = [];

        for (const [, group] of grouped) {
            const first = group[0]!;
            annotations.push({
                side: first.side,
                lineNumber: first.lineNumber,
                metadata: { kind: "existing", comment: first },
            });
        }

        if (activeDraft) {
            if (!grouped.has(commentKey(activeDraft))) {
                annotations.push({
                    side: activeDraft.side,
                    lineNumber: activeDraft.lineNumber,
                    metadata: { kind: "draft" },
                });
            }
        }

        return annotations;
    }, [comments, activeDraft]);

    const handleGutterClick = useCallback(
        (getHover: () => { lineNumber: number; side: CommentSide } | undefined) => {
            const hover = getHover();
            if (!hover) return;
            const derived = deriveLineType(patchIndex, hover.side, hover.lineNumber);
            if (!derived) return;
            onRequestDraft({
                filePath: file.path,
                side: hover.side,
                lineNumber: hover.lineNumber,
                lineType: derived.lineType,
                lineText: derived.lineText,
            });
        },
        [file.path, patchIndex, onRequestDraft],
    );

    const [hoveredLine, setHoveredLine] = useState<{
        lineNumber: number;
        side: CommentSide;
    } | null>(null);

    const handleLineEnter = useCallback(
        (props: { lineNumber: number; annotationSide: CommentSide }) => {
            setHoveredLine({ lineNumber: props.lineNumber, side: props.annotationSide });
        },
        [],
    );
    const handleLineLeave = useCallback(() => setHoveredLine(null), []);

    const diffOptions = useMemo(
        () => ({
            diffStyle: viewMode,
            disableFileHeader: true,
            overflow: (wrap ? "wrap" : "scroll") as "wrap" | "scroll",
            enableGutterUtility: true,
            collapsedContextThreshold: 20,
            expansionLineCount: 20,
            onLineEnter: handleLineEnter,
            onLineLeave: handleLineLeave,
        }),
        [viewMode, wrap, handleLineEnter, handleLineLeave],
    );

    const oldFile = useMemo(
        () => ({ name: file.oldPath ?? file.path, contents: file.oldContents ?? "" }),
        [file.oldPath, file.path, file.oldContents],
    );
    const newFile = useMemo(
        () => ({ name: file.path, contents: file.newContents ?? "" }),
        [file.path, file.newContents],
    );

    const hoverOccupied = useMemo(() => {
        if (!hoveredLine) return false;
        return lineAnnotations.some(
            (a) => a.side === hoveredLine.side && a.lineNumber === hoveredLine.lineNumber,
        );
    }, [hoveredLine, lineAnnotations]);

    return (
        <section
            id={fileCardId(file.path)}
            className="group/card border-border bg-card relative overflow-clip border-r border-b"
            data-file-path={file.path}
        >
            <Collapsible open={open} onOpenChange={handleOpenChange}>
                <div className="bg-card border-border sticky top-0 z-10 flex min-h-10 items-center justify-between gap-3 border-b px-3 py-1.5 pl-4">
                    <CollapsibleTrigger asChild>
                        <button className="flex min-w-0 flex-1 items-center gap-2 text-left">
                            {open ? (
                                <ChevronDown className="text-muted-foreground group-hover/card:text-foreground/80 size-4 shrink-0 transition-colors" />
                            ) : (
                                <ChevronRight className="text-muted-foreground group-hover/card:text-foreground/80 size-4 shrink-0 transition-colors" />
                            )}
                            <span className="text-muted-foreground shrink-0">
                                <StatusIcon status={file.status} />
                            </span>
                            <span className="truncate font-mono text-[12.5px]" title={file.path}>
                                {file.oldPath ? (
                                    <>
                                        <span className="text-muted-foreground line-through">
                                            {file.oldPath}
                                        </span>
                                        <span className="text-muted-foreground mx-1.5">→</span>
                                        <span className="text-muted-foreground">{dir}</span>
                                        <span className="text-foreground font-medium">{base}</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-muted-foreground">{dir}</span>
                                        <span className="text-foreground font-medium">{base}</span>
                                    </>
                                )}
                            </span>
                        </button>
                    </CollapsibleTrigger>
                    <div className="flex shrink-0 items-center gap-2">
                        {comments.length > 0 ? (
                            <Badge
                                variant="outline"
                                className="hidden font-mono text-[10px] sm:inline-flex"
                            >
                                {comments.length} comment{comments.length === 1 ? "" : "s"}
                            </Badge>
                        ) : null}
                        <Badge variant={STATUS_VARIANT[file.status]} dot>
                            {file.status}
                        </Badge>
                        <span className="font-mono text-[11px] text-emerald-600 tabular-nums dark:text-emerald-400">
                            +{file.additions}
                        </span>
                        <span className="font-mono text-[11px] text-rose-600 tabular-nums dark:text-rose-400">
                            −{file.deletions}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-foreground size-7 opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100"
                            onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard?.writeText(file.path);
                            }}
                            title="Copy path"
                        >
                            <Copy className="size-3.5" />
                        </Button>
                    </div>
                </div>
                <div
                    className="grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                >
                    <div className="overflow-hidden">
                        <div className="p-0 pl-1">
                            {file.skipped ? (
                                <SkippedPreview reason={file.skipped.reason} />
                            ) : (
                                <DiffErrorBoundary
                                    key={file.path}
                                    fallback={<SkippedPreview reason="render-error" />}
                                >
                                    <LazyDiffBody estimatedHeight={estimatedHeight}>
                                        <div className="bg-card overflow-x-auto">
                                            <MultiFileDiff<AnnotationMeta>
                                                oldFile={oldFile}
                                                newFile={newFile}
                                                options={diffOptions}
                                                lineAnnotations={lineAnnotations}
                                                renderAnnotation={(a) => {
                                                    if (a.metadata.kind === "draft") {
                                                        return (
                                                            <CommentComposer
                                                                onSave={onSaveDraft}
                                                                onCancel={onCancelDraft}
                                                            />
                                                        );
                                                    }
                                                    return (
                                                        <CommentIndicator
                                                            comment={a.metadata.comment}
                                                            onEdit={onEditComment}
                                                            onDelete={onDeleteComment}
                                                            onFocusInSidebar={onFocusComment}
                                                            flash={
                                                                flashCommentId ===
                                                                a.metadata.comment.id
                                                            }
                                                        />
                                                    );
                                                }}
                                                renderGutterUtility={(getHover) =>
                                                    hoverOccupied ? null : (
                                                        <GutterAddButton
                                                            onClick={() =>
                                                                handleGutterClick(getHover)
                                                            }
                                                        />
                                                    )
                                                }
                                            />
                                        </div>
                                    </LazyDiffBody>
                                </DiffErrorBoundary>
                            )}
                        </div>
                    </div>
                </div>
            </Collapsible>
        </section>
    );
}

export const FileCard = memo(FileCardImpl);
