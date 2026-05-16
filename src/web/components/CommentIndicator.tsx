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

export function CommentIndicator({ comment, onEdit, onDelete, onFocusInSidebar, flash }: Props) {
    const [editing, setEditing] = useState(false);
    const stale = Boolean(comment.stale);

    return (
        <div
            id={commentIndicatorDomId(comment.id)}
            className={cn(
                "border-primary/20 bg-card mx-3 mt-0 mb-2 overflow-hidden rounded-lg rounded-t-none border border-t-0",
                stale && "opacity-60",
                flash && "ring-primary/60 ring-2 ring-offset-1 ring-offset-transparent",
            )}
        >
            <div className="px-3 pt-2.5 pb-2">
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
                    <p className="text-foreground/90 text-[12.5px] leading-relaxed whitespace-pre-wrap">
                        {comment.body}
                    </p>
                )}
            </div>
            {!editing ? (
                <div className="from-primary/3 to-primary/0 border-primary/10 flex items-center justify-between gap-2 border-t bg-linear-to-b px-3 py-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="text-muted-foreground/70 font-mono text-[10.5px] tabular-nums">
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
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
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
            ) : null}
        </div>
    );
}
