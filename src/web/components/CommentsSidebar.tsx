import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    ChevronDown,
    ChevronRight,
    Check,
    Copy,
    Pencil,
    Trash2,
    X,
    MessageSquareOff,
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
        <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-14 flex h-[calc(100vh-3.5rem)] min-h-0 flex-col self-start overflow-hidden border-l">
            <div className="border-sidebar-border flex h-12 shrink-0 items-center justify-between border-b px-3">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10.5px] font-medium tracking-[0.12em] uppercase">
                        Comments
                    </span>
                    {totalCount > 0 ? (
                        <Badge variant="outline" className="font-mono text-[10.5px]">
                            {totalCount}
                        </Badge>
                    ) : null}
                </div>
            </div>

            {totalCount === 0 ? (
                <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-[12px]">
                    <MessageSquareOff className="size-5 opacity-60" />
                    <p>Hover a line and click the + to leave a comment.</p>
                </div>
            ) : (
                <ScrollArea className="flex-1">
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
                <span className="text-muted-foreground text-[11px]">{selectedCount} selected</span>
                <Button
                    size="sm"
                    onClick={onCopy}
                    disabled={selectedCount === 0}
                    className="gap-1.5"
                >
                    <Copy className="size-3.5" />
                    Copy selected
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
        <Collapsible open={open} onOpenChange={setOpen} className="mb-1">
            <div className="hover:bg-muted/40 flex items-center gap-1.5 rounded-md px-1 py-1">
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
                        <span
                            className="text-foreground/90 truncate font-mono text-[12px]"
                            title={group.path}
                        >
                            {group.path}
                        </span>
                        <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                            {group.comments.length}
                        </Badge>
                    </button>
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
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
    register: (el: HTMLDivElement | null) => void;
}

function CommentRow({
    comment,
    checked,
    flash,
    onToggle,
    onEdit,
    onDelete,
    register,
}: CommentRowProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(comment.body);

    useEffect(() => {
        if (!editing) setDraft(comment.body);
    }, [editing, comment.body]);

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
                "border-border/60 bg-background/40 rounded-md border p-2 transition-shadow",
                comment.stale && "opacity-60",
                flash && "ring-primary/60 ring-2 ring-offset-1 ring-offset-transparent",
            )}
        >
            <div className="flex items-start gap-2">
                <Checkbox
                    checked={checked}
                    onCheckedChange={onToggle}
                    disabled={comment.stale}
                    className="mt-0.5"
                    aria-label="Select comment"
                />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-muted-foreground font-mono">
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
                            <Badge variant="outline" className="text-[9.5px]">
                                stale
                            </Badge>
                        ) : null}
                        <div className="ml-auto flex items-center gap-0.5">
                            {!editing && !comment.stale ? (
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
                                className="text-muted-foreground/70 size-6 hover:text-rose-400"
                                onClick={onDelete}
                                title="Delete comment"
                            >
                                <Trash2 className="size-3" />
                            </Button>
                        </div>
                    </div>
                    <pre className="text-muted-foreground/80 mt-1 truncate font-mono text-[11px]">
                        {comment.lineText || " "}
                    </pre>
                    {editing ? (
                        <div className="mt-1.5">
                            <Textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                rows={3}
                                className="min-h-14 resize-y text-[12px]"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                        e.preventDefault();
                                        setEditing(false);
                                    } else if (
                                        e.key === "Enter" &&
                                        (e.metaKey || e.ctrlKey) &&
                                        draft.trim()
                                    ) {
                                        e.preventDefault();
                                        onEdit(draft.trim());
                                        setEditing(false);
                                    }
                                }}
                            />
                            <div className="mt-1 flex items-center justify-end gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6"
                                    onClick={() => setEditing(false)}
                                    title="Cancel"
                                >
                                    <X className="size-3" />
                                </Button>
                                <Button
                                    size="icon"
                                    className="size-6"
                                    disabled={!draft.trim()}
                                    onClick={() => {
                                        onEdit(draft.trim());
                                        setEditing(false);
                                    }}
                                    title="Save"
                                >
                                    <Check className="size-3" />
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-foreground/85 mt-1 text-[12.5px] whitespace-pre-wrap">
                            {comment.body}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
