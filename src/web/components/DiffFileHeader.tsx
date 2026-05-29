import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    ArrowRight,
    ChevronDown,
    ChevronRight,
    Copy,
    FileBox,
    FileMinus,
    FilePen,
    FilePlus,
} from "lucide-react";

import type { FileStatus, ParsedFile } from "@/lib/types";

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

interface Props {
    file: ParsedFile;
    open: boolean;
    commentCount: number;
    onToggle: (path: string) => void;
}

export function DiffFileHeader({ file, open, commentCount, onToggle }: Props) {
    const { dir, base } = splitPath(file.path);

    return (
        <div className="bg-muted/60 border-border/60 group/card relative flex items-center justify-between gap-3 border-b px-3 py-2 pl-4 backdrop-blur">
            <span
                aria-hidden
                className={cn("absolute inset-y-0 left-0 w-0.5", STATUS_STRIPE[file.status])}
            />
            <button
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => onToggle(file.path)}
            >
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
            <div className="flex shrink-0 items-center gap-2.5">
                {commentCount > 0 ? (
                    <Badge variant="outline" className="font-mono text-[10px]">
                        {commentCount} comment{commentCount === 1 ? "" : "s"}
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
    );
}
