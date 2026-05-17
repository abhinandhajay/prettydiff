import { InlineCommentEditor } from "@/components/InlineCommentEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    ChevronDown,
    ChevronRight,
    Copy,
    Pencil,
    Trash2,
    MessageSquareOff,
    FolderClosed,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CommentMap, DiffComment } from "@/lib/types";

interface Props {
    comments: CommentMap;
    selectedIds: Set<string>;
    onToggleSelected: (id: string) => void;
    onToggleFile: (filePath: string, select: boolean) => void;
    onEdit: (id: string, body: string) => void;
    onDelete: (id: string) => void;
    onCopy: () => void;
    scrollToId: string | null;
    onScrollHandled: () => void;
    onJumpToDiff: (id: string) => void;
    open: boolean;
}

interface FileGroup {
    path: string;
    comments: DiffComment[];
    active: DiffComment[];
    stale: DiffComment[];
}

function groupByFile(comments: CommentMap): FileGroup[] {
    return Object.entries(comments)
        .map(([path, list]) => {
            const sorted = [...list].sort((a, b) => a.lineNumber - b.lineNumber);
            return {
                path,
                comments: sorted,
                active: sorted.filter((c) => !c.stale),
                stale: sorted.filter((c) => Boolean(c.stale)),
            };
        })
        .filter((g) => g.comments.length > 0)
        .sort((a, b) => a.path.localeCompare(b.path));
}

export function CommentsSidebar({
    comments,
    selectedIds,
    onToggleSelected,
    onToggleFile,
    onEdit,
    onDelete,
    onCopy,
    scrollToId,
    onScrollHandled,
    onJumpToDiff,
    open,
}: Props) {
    const groups = useMemo(() => groupByFile(comments), [comments]);
    const totalCount = useMemo(
        () => Object.values(comments).reduce((n, list) => n + list.length, 0),
        [comments],
    );
    const selectedCount = useMemo(() => {
        let n = 0;
        for (const list of Object.values(comments)) {
            for (const c of list) {
                if (selectedIds.has(c.id) && !c.stale) n += 1;
            }
        }
        return n;
    }, [comments, selectedIds]);

    const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const [flashId, setFlashId] = useState<string | null>(null);

    useEffect(() => {
        if (!scrollToId) return;
        const el = rowRefs.current.get(scrollToId);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            setFlashId(scrollToId);
            const t = window.setTimeout(() => setFlashId(null), 1400);
            onScrollHandled();
            return () => window.clearTimeout(t);
        }
        onScrollHandled();
    }, [scrollToId, onScrollHandled]);

    return (
        <aside
            data-state={open ? "open" : "closed"}
            className={cn(
                "bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full w-[340px] min-h-0 flex-col overflow-hidden border-l",
                "transition-[transform,opacity] duration-280 ease-[cubic-bezier(0.32,0.72,0,1)]",
                "data-[state=closed]:translate-x-full data-[state=closed]:opacity-0",
                "data-[state=closed]:pointer-events-none",
            )}
            aria-hidden={!open}
        >
            <div className="border-sidebar-border flex h-12 shrink-0 items-center justify-between border-b px-3">
                <div className="flex items-center gap-2">
                    <span className="text-primary text-[11px] leading-none">◆</span>
                    <span className="text-foreground/85 text-[11px] font-medium tracking-[0.14em] uppercase">
                        Comments
                    </span>
                    {totalCount > 0 ? (
                        <Badge
                            variant="outline"
                            className="ml-1 font-mono text-[10.5px] tabular-nums"
                        >
                            {totalCount}
                        </Badge>
                    ) : null}
                </div>
            </div>

            {totalCount === 0 ? (
                <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <MessageSquareOff className="size-5 opacity-60" />
                    <p className="text-foreground/70 max-w-55 text-[12.5px] leading-snug">
                        Hover a line, tap +, leave a note.
                    </p>
                </div>
            ) : (
                <ScrollArea className="flex-1 [&>[data-radix-scroll-area-viewport]>div]:block!">
                    <div className="px-2 py-2">
                        {groups.map((g) => (
                            <FileGroupBlock
                                key={g.path}
                                group={g}
                                selectedIds={selectedIds}
                                flashId={flashId}
                                onToggleSelected={onToggleSelected}
                                onToggleFile={onToggleFile}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onJumpToDiff={onJumpToDiff}
                                registerRow={(id, el) => {
                                    if (el) rowRefs.current.set(id, el);
                                    else rowRefs.current.delete(id);
                                }}
                            />
                        ))}
                    </div>
                </ScrollArea>
            )}

            <Separator />
            <div className="border-sidebar-border flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2">
                <span className="text-muted-foreground text-[11px]">
                    {selectedCount > 0 ? (
                        <>
                            <span className="text-foreground/90 font-mono tabular-nums">
                                {selectedCount}
                            </span>{" "}
                            selected · ready to copy
                        </>
                    ) : (
                        "Nothing selected"
                    )}
                </span>
                <Button
                    size="sm"
                    onClick={onCopy}
                    disabled={selectedCount === 0}
                    className="gap-1.5"
                >
                    <Copy className="size-3.5" />
                    Copy for agent
                </Button>
            </div>
        </aside>
    );
}

interface FileGroupProps {
    group: FileGroup;
    selectedIds: Set<string>;
    flashId: string | null;
    onToggleSelected: (id: string) => void;
    onToggleFile: (filePath: string, select: boolean) => void;
    onEdit: (id: string, body: string) => void;
    onDelete: (id: string) => void;
    onJumpToDiff: (id: string) => void;
    registerRow: (id: string, el: HTMLDivElement | null) => void;
}

function FileGroupBlock({
    group,
    selectedIds,
    flashId,
    onToggleSelected,
    onToggleFile,
    onEdit,
    onDelete,
    onJumpToDiff,
    registerRow,
}: FileGroupProps) {
    const [open, setOpen] = useState(true);
    const active = group.active;
    const selectedInGroup = active.filter((c) => selectedIds.has(c.id)).length;
    const headerCheckState: boolean | "indeterminate" =
        active.length === 0
            ? false
            : selectedInGroup === 0
              ? false
              : selectedInGroup === active.length
                ? true
                : "indeterminate";

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="mb-1.5">
            <div className="hover:bg-muted/40 flex items-center gap-1.5 rounded-md px-1.5 py-1.5">
                <Checkbox
                    checked={headerCheckState}
                    onCheckedChange={(v) => onToggleFile(group.path, v === true)}
                    disabled={active.length === 0}
                    aria-label={`Select all comments in ${group.path}`}
                />
                <CollapsibleTrigger asChild>
                    <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                        {open ? (
                            <ChevronDown className="text-muted-foreground/70 size-3.5 shrink-0" />
                        ) : (
                            <ChevronRight className="text-muted-foreground/70 size-3.5 shrink-0" />
                        )}
                        <FolderClosed className="text-muted-foreground/60 size-3 shrink-0" />
                        <span
                            className="text-foreground/90 truncate font-mono text-[12px]"
                            title={group.path}
                        >
                            {group.path}
                        </span>
                        <span className="bg-muted/40 text-muted-foreground/90 ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                            {group.comments.length}
                        </span>
                    </button>
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
                <div className="ml-5 flex flex-col gap-1.5 py-1">
                    {group.comments.map((c) => (
                        <CommentRow
                            key={c.id}
                            comment={c}
                            checked={selectedIds.has(c.id)}
                            flash={flashId === c.id}
                            onToggle={() => onToggleSelected(c.id)}
                            onEdit={(body) => onEdit(c.id, body)}
                            onDelete={() => onDelete(c.id)}
                            onJumpToDiff={() => onJumpToDiff(c.id)}
                            register={(el) => registerRow(c.id, el)}
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

interface CommentRowProps {
    comment: DiffComment;
    checked: boolean;
    flash: boolean;
    onToggle: () => void;
    onEdit: (body: string) => void;
    onDelete: () => void;
    onJumpToDiff: () => void;
    register: (el: HTMLDivElement | null) => void;
}

function CommentRow({
    comment,
    checked,
    flash,
    onToggle,
    onEdit,
    onDelete,
    onJumpToDiff,
    register,
}: CommentRowProps) {
    const [editing, setEditing] = useState(false);

    const sideMark =
        comment.lineType === "change-addition"
            ? "+"
            : comment.lineType === "change-deletion"
              ? "−"
              : " ";

    return (
        <div
            ref={register}
            className={cn(
                "relative mr-3 overflow-hidden rounded-lg border transition-[box-shadow,background-color,border-color]",
                "border-border/50 bg-card",
                checked && !comment.stale && "border-primary/40 bg-primary/4",
                comment.stale && "opacity-60",
                flash && "ring-primary/60 ring-2 ring-offset-1 ring-offset-transparent",
            )}
        >
            <div
                className={cn(
                    "bg-muted/40 border-border/50 flex items-center justify-between gap-1.5 border-b px-2.5 py-1",
                    checked && !comment.stale && "border-primary/25",
                )}
            >
                <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
                    <span className="text-muted-foreground font-mono tabular-nums">
                        L{comment.lineNumber}
                    </span>
                    <span
                        className={cn(
                            "font-mono",
                            comment.lineType === "change-addition" && "text-emerald-400",
                            comment.lineType === "change-deletion" && "text-rose-400",
                            (comment.lineType === "context" ||
                                comment.lineType === "context-expanded") &&
                                "text-muted-foreground",
                        )}
                    >
                        {sideMark}
                    </span>
                    {comment.stale ? (
                        <Badge
                            variant="outline"
                            className="text-muted-foreground/80 border-border/60 px-1 py-0 text-[9.5px] leading-[1.4] font-normal tracking-wide uppercase"
                        >
                            outdated
                        </Badge>
                    ) : null}
                </div>
                <Checkbox
                    checked={checked}
                    onCheckedChange={onToggle}
                    disabled={comment.stale}
                    aria-label="Select comment"
                />
            </div>
            <div className="px-2.5 pt-2 pb-2">
                <pre className="text-muted-foreground/80 truncate font-mono text-[11px]">
                    {comment.lineText || " "}
                </pre>
                {editing ? (
                    <div className="mt-1.5">
                        <InlineCommentEditor
                            initialValue={comment.body}
                            onSave={(body) => {
                                onEdit(body);
                                setEditing(false);
                            }}
                            onCancel={() => setEditing(false)}
                            rows={3}
                        />
                    </div>
                ) : (
                    <p className="text-foreground/85 mt-1.5 text-[12.5px] leading-relaxed whitespace-pre-wrap">
                        {comment.body}
                    </p>
                )}
            </div>
            {!editing ? (
                <div className="bg-muted/40 border-border/50 flex items-center justify-between gap-2 border-t px-2.5 py-1">
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground/70 font-mono text-[10.5px] tabular-nums">
                            {formatRelativeTime(comment.createdAt)}
                        </span>
                        <button
                            type="button"
                            onClick={onJumpToDiff}
                            className="text-muted-foreground/80 hover:text-foreground/90 text-[10.5px] underline-offset-2 transition-colors hover:underline"
                            title="Show in diff"
                        >
                            show in diff
                        </button>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        {!comment.stale ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground/70 hover:text-foreground size-6"
                                onClick={() => setEditing(true)}
                                title="Edit comment"
                            >
                                <Pencil className="size-3" />
                            </Button>
                        ) : null}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground/70 hover:bg-destructive hover:text-destructive-foreground size-6"
                            onClick={onDelete}
                            title="Delete comment"
                        >
                            <Trash2 className="size-3" />
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
