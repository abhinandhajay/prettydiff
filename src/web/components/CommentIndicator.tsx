import { InlineCommentEditor } from "@/components/InlineCommentEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import type { DiffComment } from "@/lib/types";

interface Props {
    comment: DiffComment;
    onEdit: (id: string, body: string) => void;
    onDelete: (id: string) => void;
    onFocusInSidebar: (id: string) => void;
    flash?: boolean;
}

export function commentIndicatorDomId(id: string): string {
    return `comment-line-${id}`;
}

/** Left rail color keyed to the commented line, mirroring the diff's change bars. */
const RAIL: Record<DiffComment["lineType"], string> = {
    "change-addition": "bg-emerald-500/70",
    "change-deletion": "bg-rose-500/70",
    context: "bg-muted-foreground/30",
    "context-expanded": "bg-muted-foreground/30",
};

export function CommentIndicator({ comment, onEdit, onDelete, onFocusInSidebar, flash }: Props) {
    const [editing, setEditing] = useState(false);
    const stale = Boolean(comment.stale);

    return (
        <div
            id={commentIndicatorDomId(comment.id)}
            className={cn(
                "border-border/55 bg-muted/25 relative border-b py-2 pr-3 pl-4 transition-colors",
                stale && "opacity-60",
                flash && "bg-primary/10",
            )}
        >
            <span
                aria-hidden
                className={cn("absolute inset-y-0 left-0 w-[2px]", RAIL[comment.lineType])}
            />
            {editing ? (
                <InlineCommentEditor
                    initialValue={comment.body}
                    onSave={(body) => {
                        onEdit(comment.id, body);
                        setEditing(false);
                    }}
                    onCancel={() => setEditing(false)}
                    rows={3}
                    minHeightClass="min-h-16"
                />
            ) : (
                <>
                    <p className="text-foreground/90 text-[12.5px] leading-relaxed whitespace-pre-wrap">
                        {comment.body}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-muted-foreground/60 font-mono text-[10.5px] tabular-nums">
                            {formatRelativeTime(comment.createdAt)}
                        </span>
                        {stale ? (
                            <Badge
                                variant="outline"
                                className="text-muted-foreground/80 border-border/60 px-1 py-0 text-[9.5px] leading-[1.4] font-normal tracking-wide uppercase"
                            >
                                outdated
                            </Badge>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => onFocusInSidebar(comment.id)}
                            className="text-muted-foreground/80 hover:text-foreground/90 font-sans text-[10.5px] underline-offset-2 transition-colors hover:underline"
                            title="Show in sidebar"
                        >
                            open in sidebar
                        </button>
                        <div className="ml-auto flex shrink-0 items-center gap-0.5">
                            {!stale ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground/70 hover:text-foreground size-6"
                                    onClick={() => setEditing(true)}
                                    title="Edit"
                                >
                                    <Pencil className="size-3" />
                                </Button>
                            ) : null}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground/70 hover:bg-destructive hover:text-destructive-foreground size-6"
                                onClick={() => onDelete(comment.id)}
                                title="Delete"
                            >
                                <Trash2 className="size-3" />
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
