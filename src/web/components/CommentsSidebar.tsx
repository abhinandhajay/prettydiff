import { InlineCommentEditor } from "@/components/InlineCommentEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { lineTypeAccent } from "@/lib/comments";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    Check,
    ChevronDown,
    ChevronRight,
    Copy,
    Pencil,
    Trash2,
    MessageSquareOff,
    FolderClosed,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CommentLineType, CommentMap, DiffComment } from "@/lib/types";

interface CommentsPanelProps {
    comments: CommentMap;
    totalCount: number;
    selectedIds: Set<string>;
    onToggleSelected: (id: string) => void;
    onToggleFile: (filePath: string, select: boolean) => void;
    onEdit: (id: string, body: string) => void;
    onDelete: (id: string) => void;
    onCopy: () => void;
    scrollToId: string | null;
    onScrollHandled: () => void;
    onJumpToDiff: (id: string) => void;
}

interface Props extends CommentsPanelProps {
    open: boolean;
}

interface FileGroup {
    path: string;
    comments: DiffComment[];
    active: DiffComment[];
}

function groupByFile(comments: CommentMap): FileGroup[] {
    return Object.entries(comments)
        .map(([path, list]) => {
            const sorted = [...list].sort((a, b) => a.lineNumber - b.lineNumber);
            return {
                path,
                comments: sorted,
                active: sorted.filter((c) => !c.stale),
            };
        })
        .filter((g) => g.comments.length > 0)
        .sort((a, b) => a.path.localeCompare(b.path));
}

const SIDE_MARK: Record<CommentLineType, string> = {
    "change-addition": "+",
    "change-deletion": "−",
    context: "",
    "context-expanded": "",
};

function fileHeaderCheckState(
    activeCount: number,
    selectedInGroup: number,
): boolean | "indeterminate" {
    if (activeCount === 0 || selectedInGroup === 0) return false;
    if (selectedInGroup === activeCount) return true;
    return "indeterminate";
}

export function CommentsPanelContent({
    comments,
    totalCount,
    selectedIds,
    onToggleSelected,
    onToggleFile,
    onEdit,
    onDelete,
    onCopy,
    scrollToId,
    onScrollHandled,
    onJumpToDiff,
}: CommentsPanelProps) {
    const groups = useMemo(() => groupByFile(comments), [comments]);
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
    const [justCopied, setJustCopied] = useState(false);
    const copiedTimerRef = useRef<number | null>(null);

    useEffect(
        () => () => {
            if (copiedTimerRef.current !== null) {
                window.clearTimeout(copiedTimerRef.current);
            }
        },
        [],
    );

    const handleCopy = () => {
        onCopy();
        setJustCopied(true);
        if (copiedTimerRef.current !== null) {
            window.clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = window.setTimeout(() => {
            setJustCopied(false);
            copiedTimerRef.current = null;
        }, 1500);
    };

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
        <>
            {totalCount === 0 ? (
                <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <MessageSquareOff className="size-5 opacity-60" />
                    <p className="text-foreground/65 max-w-55 text-[12px] leading-snug">
                        Hover a line, tap +, leave a note.
                    </p>
                </div>
            ) : (
                <ScrollArea className="min-h-0 flex-1 [&>[data-radix-scroll-area-viewport]>div]:block!">
                    <div>
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
                    onClick={handleCopy}
                    disabled={selectedCount === 0}
                    className={cn(
                        "transition-colors",
                        justCopied && "bg-emerald-500/90 text-white hover:bg-emerald-500/90",
                    )}
                >
                    <span className="grid">
                        <span
                            aria-hidden
                            className="invisible col-start-1 row-start-1 flex items-center justify-center gap-1.5"
                        >
                            <Copy className="size-3.5" />
                            Copy for agent
                        </span>
                        <span className="col-start-1 row-start-1 flex items-center justify-center gap-1.5">
                            {justCopied ? (
                                <Check className="size-3.5" />
                            ) : (
                                <Copy className="size-3.5" />
                            )}
                            {justCopied ? "Copied" : "Copy for agent"}
                        </span>
                    </span>
                </Button>
            </div>
        </>
    );
}

export function CommentsSidebar({ open, ...props }: Props) {
    return (
        <aside
            data-state={open ? "open" : "closed"}
            className={cn(
                "bg-sidebar text-sidebar-foreground border-sidebar-border pointer-events-auto flex h-full w-full min-w-0 flex-col overflow-hidden border-l",
                "transition-[translate,opacity] duration-280 ease-[cubic-bezier(0.32,0.72,0,1)]",
                "data-[state=closed]:translate-x-full data-[state=closed]:opacity-0",
                "data-[state=closed]:pointer-events-none",
            )}
            aria-hidden={!open}
        >
            <div className="border-sidebar-border flex h-10 shrink-0 items-center justify-between border-b px-3">
                <div className="flex items-center gap-2">
                    <span className="bg-muted-foreground/80 size-1.5 rounded-full" aria-hidden />
                    <span className="text-muted-foreground text-[10px] font-medium tracking-[0.13em] uppercase">
                        Comments
                    </span>
                    {props.totalCount > 0 ? (
                        <Badge
                            variant="outline"
                            className="ml-1 font-mono text-[10.5px] tabular-nums"
                        >
                            {props.totalCount}
                        </Badge>
                    ) : null}
                </div>
            </div>
            <CommentsPanelContent {...props} />
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
    const headerCheckState = fileHeaderCheckState(active.length, selectedInGroup);

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <div className="bg-sidebar border-sidebar-border sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-1.5">
                <Checkbox
                    checked={headerCheckState}
                    onCheckedChange={(v) => onToggleFile(group.path, v === true)}
                    disabled={active.length === 0}
                    aria-label={`Select all comments in ${group.path}`}
                />
                <CollapsibleTrigger asChild>
                    <button className="group/grp flex min-w-0 flex-1 items-center gap-1.5 text-left">
                        {open ? (
                            <ChevronDown className="text-muted-foreground/70 size-3.5 shrink-0" />
                        ) : (
                            <ChevronRight className="text-muted-foreground/70 size-3.5 shrink-0" />
                        )}
                        <FolderClosed className="text-muted-foreground/60 size-3 shrink-0" />
                        <span
                            className="text-foreground/85 group-hover/grp:text-foreground truncate font-mono text-[11.5px] transition-colors"
                            title={group.path}
                        >
                            {group.path}
                        </span>
                        <span className="text-muted-foreground/80 ml-auto shrink-0 font-mono text-[10.5px] tabular-nums">
                            {group.comments.length}
                        </span>
                    </button>
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
                <div className="flex flex-col">
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
    const accent = lineTypeAccent[comment.lineType];
    const sideMark = SIDE_MARK[comment.lineType];
    const stale = Boolean(comment.stale);

    return (
        <div
            ref={register}
            className={cn(
                "border-border/55 relative border-b py-2 pr-2.5 pl-3.5 transition-colors",
                "hover:bg-muted/20",
                checked && !stale && "bg-primary/[0.05]",
                stale && "opacity-60",
                flash && "bg-primary/12",
            )}
        >
            <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[2px]", accent.rail)} />
            <div className="flex items-start gap-2">
                <Checkbox
                    checked={checked}
                    onCheckedChange={onToggle}
                    disabled={stale}
                    aria-label="Select comment"
                    className="mt-[3px] shrink-0"
                />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="shrink-0 tabular-nums">
                            {sideMark ? <span className={accent.text}>{sideMark} </span> : null}
                            <span className="text-muted-foreground">L{comment.lineNumber}</span>
                        </span>
                        {stale ? (
                            <Badge
                                variant="outline"
                                className="text-muted-foreground/80 border-border/60 px-1 py-0 text-[9.5px] leading-[1.4] font-normal tracking-wide uppercase"
                            >
                                outdated
                            </Badge>
                        ) : null}
                        <span className="text-muted-foreground/55 ml-auto shrink-0 text-[10px] tabular-nums">
                            {formatRelativeTime(comment.createdAt)}
                        </span>
                    </div>
                    <pre className="text-muted-foreground/60 mt-1 truncate font-mono text-[11px]">
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
                        <p className="text-foreground/90 mt-1 text-[12.5px] leading-relaxed whitespace-pre-wrap">
                            {comment.body}
                        </p>
                    )}
                    {!editing ? (
                        <div className="mt-1.5 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onJumpToDiff}
                                className="text-muted-foreground/80 hover:text-foreground/90 text-[10.5px] underline-offset-2 transition-colors hover:underline"
                                title="Show in diff"
                            >
                                show in diff
                            </button>
                            <div className="ml-auto flex shrink-0 items-center gap-0.5">
                                {!stale ? (
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
            </div>
        </div>
    );
}
