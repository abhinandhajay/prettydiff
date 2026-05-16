import { InlineCommentEditor } from "@/components/InlineCommentEditor";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronRight, MessageSquareText, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import type { DiffComment } from "@/lib/types";

interface Props {
    comment: DiffComment;
    onEdit: (id: string, body: string) => void;
    onDelete: (id: string) => void;
    onFocusInSidebar: (id: string) => void;
}

export function CommentIndicator({ comment, onEdit, onDelete, onFocusInSidebar }: Props) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const stale = Boolean(comment.stale);
    const preview = comment.body.split("\n")[0] ?? "";

    return (
        <Collapsible
            open={open}
            onOpenChange={(v) => {
                setOpen(v);
                if (!v) setEditing(false);
            }}
            className={cn(
                "group/comment my-0.5 overflow-hidden rounded-md border",
                open
                    ? "border-primary/30 bg-primary/6 shadow-[inset_2px_0_0_0_color-mix(in_oklab,var(--color-primary)_55%,transparent)]"
                    : "border-primary/20 bg-primary/4 hover:border-primary/30 hover:bg-primary/8",
                stale && "opacity-60",
            )}
        >
            <CollapsibleTrigger asChild>
                <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1 text-left transition-colors"
                    title={open ? "Collapse comment" : "Expand comment"}
                >
                    <MessageSquareText className="text-primary size-3.5 shrink-0" />
                    <span
                        className={cn(
                            "truncate text-[12px]",
                            open ? "text-foreground/95" : "text-foreground/85",
                        )}
                    >
                        {preview || <span className="italic opacity-70">empty note</span>}
                    </span>
                    <ChevronRight
                        className={cn(
                            "text-muted-foreground/70 ml-auto size-3.5 shrink-0 transition-transform duration-200",
                            open && "rotate-90",
                        )}
                    />
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
                <div className="border-primary/15 border-t px-2.5 pt-2 pb-2">
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
                            <div className="text-muted-foreground/80 mt-2 flex items-center gap-2 text-[10.5px]">
                                <span className="font-mono">
                                    {formatRelativeTime(comment.createdAt)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onFocusInSidebar(comment.id)}
                                    className="hover:text-foreground/90 underline-offset-2 transition-colors hover:underline"
                                    title="Show in sidebar"
                                >
                                    open in sidebar
                                </button>
                                <div className="ml-auto flex items-center gap-0.5">
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
                                        className="text-muted-foreground/70 size-6 hover:text-rose-400"
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
            </CollapsibleContent>
        </Collapsible>
    );
}
