import { CommentComposer } from "@/components/CommentComposer";
import { CommentIndicator } from "@/components/CommentIndicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { commentKey, commentsByKey, lookupLineText } from "@/lib/comments";
import { fileCardId } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { PatchDiff } from "@pierre/diffs/react";
import {
    ChevronDown,
    ChevronRight,
    Copy,
    FilePlus,
    FileMinus,
    FilePen,
    FileBox,
    ArrowRight,
    Plus,
} from "lucide-react";

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
            className="bg-primary text-primary-foreground hover:bg-primary/90 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 relative z-5 inline-flex shrink-0 items-center justify-center rounded-md transition-[transform,background-color] duration-100 ease-out hover:scale-105 active:scale-95"
            title="Add comment to this line"
            aria-label="Add comment to this line"
        >
            <Plus className="size-3" strokeWidth={3} />
        </button>
    );
}
import { useCallback, useMemo, useState } from "react";

import type { ViewMode } from "@/components/ViewToggle";
import type {
    CommentLineType,
    CommentSide,
    DiffComment,
    DraftLine,
    FileStatus,
    ParsedFile,
} from "@/lib/types";
import type { DiffLineAnnotation } from "@pierre/diffs";

type AnnotationMeta = { kind: "draft" } | { kind: "existing"; comment: DiffComment };

interface Props {
    file: ParsedFile;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    viewMode: ViewMode;
    wrap: boolean;
    comments: DiffComment[];
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

const STATUS_STRIPE: Record<FileStatus, string> = {
    added: "bg-emerald-500/70",
    modified: "bg-primary/70",
    deleted: "bg-rose-500/70",
    renamed: "bg-sky-500/60",
    untracked: "bg-amber-500/70",
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
    file: ParsedFile,
    side: CommentSide,
    lineNumber: number,
): { lineType: CommentLineType; lineText: string } | null {
    const additionText = lookupLineText(file, "additions", lineNumber);
    const deletionText = lookupLineText(file, "deletions", lineNumber);
    if (side === "additions") {
        if (additionText === undefined) return null;
        if (deletionText !== undefined && deletionText === additionText) {
            return { lineType: "context", lineText: additionText };
        }
        return { lineType: "change-addition", lineText: additionText };
    }
    if (deletionText === undefined) return null;
    if (additionText !== undefined && additionText === deletionText) {
        return { lineType: "context", lineText: deletionText };
    }
    return { lineType: "change-deletion", lineText: deletionText };
}

export function FileCard({
    file,
    open,
    onOpenChange,
    viewMode,
    wrap,
    comments,
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

        if (activeDraft && activeDraft.filePath === file.path) {
            const draftKey = commentKey({
                filePath: activeDraft.filePath,
                side: activeDraft.side,
                lineNumber: activeDraft.lineNumber,
            });
            if (!grouped.has(draftKey)) {
                annotations.push({
                    side: activeDraft.side,
                    lineNumber: activeDraft.lineNumber,
                    metadata: { kind: "draft" },
                });
            }
        }

        return annotations;
    }, [comments, activeDraft, file.path]);

    const handleGutterClick = useCallback(
        (getHover: () => { lineNumber: number; side: CommentSide } | undefined) => {
            const hover = getHover();
            if (!hover) return;
            const derived = deriveLineType(file, hover.side, hover.lineNumber);
            if (!derived) return;
            onRequestDraft({
                filePath: file.path,
                side: hover.side,
                lineNumber: hover.lineNumber,
                lineType: derived.lineType,
                lineText: derived.lineText,
            });
        },
        [file, onRequestDraft],
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
            onLineEnter: handleLineEnter,
            onLineLeave: handleLineLeave,
        }),
        [viewMode, wrap, handleLineEnter, handleLineLeave],
    );

    const hoverOccupied = useMemo(() => {
        if (!hoveredLine) return false;
        return lineAnnotations.some(
            (a) => a.side === hoveredLine.side && a.lineNumber === hoveredLine.lineNumber,
        );
    }, [hoveredLine, lineAnnotations]);

    return (
        <div
            id={fileCardId(file.path)}
            className="bg-card/80 group/card border-border/70 hover:border-border relative overflow-clip rounded-lg border transition-colors"
            data-file-path={file.path}
        >
            <span
                aria-hidden
                className={cn("absolute inset-y-0 left-0 w-0.5", STATUS_STRIPE[file.status])}
            />
            <Collapsible open={open} onOpenChange={onOpenChange}>
                <div className="bg-muted/60 border-border/60 sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-3 py-2 pl-4 backdrop-blur">
                    <CollapsibleTrigger asChild>
                        <button className="flex min-w-0 flex-1 items-center gap-2 text-left">
                            {open ? (
                                <ChevronDown className="text-muted-foreground/70 group-hover/card:text-muted-foreground size-4 shrink-0 transition-colors" />
                            ) : (
                                <ChevronRight className="text-muted-foreground/70 group-hover/card:text-muted-foreground size-4 shrink-0 transition-colors" />
                            )}
                            <span className="text-muted-foreground/80 shrink-0">
                                <StatusIcon status={file.status} />
                            </span>
                            <span className="truncate font-mono text-[13px]" title={file.path}>
                                {file.oldPath ? (
                                    <>
                                        <span className="text-muted-foreground/70 line-through">
                                            {file.oldPath}
                                        </span>
                                        <span className="text-muted-foreground mx-1.5">→</span>
                                        <span className="text-muted-foreground/70">{dir}</span>
                                        <span className="text-foreground font-medium">{base}</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-muted-foreground/70">{dir}</span>
                                        <span className="text-foreground font-medium">{base}</span>
                                    </>
                                )}
                            </span>
                        </button>
                    </CollapsibleTrigger>
                    <div className="flex shrink-0 items-center gap-2.5">
                        {comments.length > 0 ? (
                            <Badge variant="outline" className="font-mono text-[10px]">
                                {comments.length} comment{comments.length === 1 ? "" : "s"}
                            </Badge>
                        ) : null}
                        <Badge variant={STATUS_VARIANT[file.status]} dot>
                            {file.status}
                        </Badge>
                        <span className="font-mono text-[11px] text-emerald-400 tabular-nums">
                            +{file.additions}
                        </span>
                        <span className="font-mono text-[11px] text-rose-400 tabular-nums">
                            −{file.deletions}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground/70 hover:text-foreground size-7"
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
                <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
                    <div className="px-3 py-2 pl-4">
                        {file.skipped ? (
                            <div className="bg-muted/30 text-muted-foreground border-border/60 rounded-md border border-dashed px-3 py-8 text-center text-sm">
                                {file.skipped.reason === "binary"
                                    ? "Binary file — preview skipped."
                                    : "File too large — preview skipped."}
                            </div>
                        ) : (
                            <div className="bg-background/40 overflow-x-auto">
                                <PatchDiff<AnnotationMeta>
                                    patch={file.rawPatch}
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
                                                flash={flashCommentId === a.metadata.comment.id}
                                            />
                                        );
                                    }}
                                    renderGutterUtility={(getHover) =>
                                        hoverOccupied ? null : (
                                            <GutterAddButton
                                                onClick={() => handleGutterClick(getHover)}
                                            />
                                        )
                                    }
                                />
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
