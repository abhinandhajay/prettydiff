import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ViewToggle, type ViewMode } from "@/components/ViewToggle";
import { repoBasename } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    ChevronsDownUp,
    ChevronsUpDown,
    GitBranch,
    MessageSquare,
    RefreshCw,
    WrapText,
} from "lucide-react";
import { useMemo } from "react";

import type { DiffPayload } from "@/lib/types";

interface Props {
    payload: DiffPayload;
    viewMode: ViewMode;
    onViewModeChange: (v: ViewMode) => void;
    wrap: boolean;
    onWrapChange: (w: boolean) => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    onReload: () => void;
    isReloading: boolean;
    showComments: boolean;
    onShowCommentsChange: (v: boolean) => void;
    commentCount: number;
}

function LogoMark({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 16 16"
            aria-hidden
            className={className}
            xmlns="http://www.w3.org/2000/svg"
        >
            <rect x="1.75" y="3" width="7" height="2.25" rx="1" fill="currentColor" />
            <rect
                x="7.25"
                y="10.75"
                width="7"
                height="2.25"
                rx="1"
                fill="currentColor"
                opacity="0.55"
            />
        </svg>
    );
}

/** Mini horizontal ratio bar for additions vs deletions. */
function RatioBar({ add, del }: { add: number; del: number }) {
    const total = add + del;
    const addPct = total === 0 ? 0 : (add / total) * 100;
    const delPct = total === 0 ? 0 : (del / total) * 100;
    return (
        <div
            className="bg-border/80 relative h-[3px] w-18 overflow-hidden rounded-full"
            aria-hidden
        >
            <div
                className="h-full bg-emerald-400/80"
                style={{ width: `${addPct}%`, float: "left" }}
            />
            <div className="h-full bg-rose-400/80" style={{ width: `${delPct}%`, float: "left" }} />
        </div>
    );
}

function Divider() {
    return <span aria-hidden className="bg-border/80 h-4 w-px shrink-0" />;
}

export function Header({
    payload,
    viewMode,
    onViewModeChange,
    wrap,
    onWrapChange,
    onExpandAll,
    onCollapseAll,
    onReload,
    isReloading,
    showComments,
    onShowCommentsChange,
    commentCount,
}: Props) {
    const totals = useMemo(
        () =>
            payload.files.reduce(
                (acc, f) => {
                    acc.add += f.additions;
                    acc.del += f.deletions;
                    return acc;
                },
                { add: 0, del: 0 },
            ),
        [payload.files],
    );

    return (
        <header className="bg-background isolate z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3">
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground bg-card border-border inline-flex size-7 items-center justify-center rounded border">
                        <LogoMark className="size-4" />
                    </span>
                    <span className="text-foreground text-[14px] font-semibold tracking-tight">
                        prettydiff
                    </span>
                </div>
                <Divider />
                <div className="text-muted-foreground hidden min-w-0 items-center gap-2 text-[12.5px] md:flex">
                    <span
                        className="text-foreground/85 truncate font-medium"
                        title={payload.repoRoot}
                    >
                        {repoBasename(payload.repoRoot)}
                    </span>
                    <span className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[11px]">
                        <GitBranch className="size-3" />
                        {payload.branch}
                    </span>
                    {payload.head ? (
                        <span className="text-muted-foreground/80 font-mono text-[11px]">
                            {payload.head.slice(0, 7)}
                        </span>
                    ) : null}
                </div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
                <div className="hidden items-center gap-2.5 sm:flex">
                    <div className="flex items-center gap-1.5 text-[12px]">
                        <span className="text-foreground font-mono font-semibold tabular-nums">
                            {payload.files.length}
                        </span>
                        <span className="text-muted-foreground">
                            file{payload.files.length === 1 ? "" : "s"}
                        </span>
                    </div>
                    <Divider />
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[11.5px] text-emerald-600 tabular-nums dark:text-emerald-400">
                            +{totals.add}
                        </span>
                        <span className="font-mono text-[11.5px] text-rose-600 tabular-nums dark:text-rose-400">
                            −{totals.del}
                        </span>
                        <RatioBar add={totals.add} del={totals.del} />
                    </div>
                </div>
                <Divider />
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onReload}
                        disabled={isReloading}
                        title="Reload diff"
                        className="text-muted-foreground hover:text-foreground size-8 px-0"
                    >
                        <RefreshCw className={isReloading ? "animate-spin" : undefined} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onWrapChange(!wrap)}
                        aria-pressed={wrap}
                        title={wrap ? "Disable line wrapping" : "Enable line wrapping"}
                        className={cn(
                            "text-muted-foreground hover:text-foreground size-8 px-0",
                            wrap && "text-foreground bg-muted",
                        )}
                    >
                        <WrapText />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onExpandAll}
                        title="Expand all files"
                        className="text-muted-foreground hover:text-foreground size-8 px-0"
                    >
                        <ChevronsUpDown />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onCollapseAll}
                        title="Collapse all files"
                        className="text-muted-foreground hover:text-foreground size-8 px-0"
                    >
                        <ChevronsDownUp />
                    </Button>
                </div>
                <ViewToggle value={viewMode} onChange={onViewModeChange} />
                <Divider />
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onShowCommentsChange(!showComments)}
                    aria-pressed={showComments}
                    title={showComments ? "Hide comments sidebar" : "Show comments sidebar"}
                    className={cn(
                        "relative text-muted-foreground hover:text-foreground",
                        showComments && "text-foreground bg-muted",
                    )}
                >
                    <MessageSquare />
                    <span className="hidden lg:inline">Comments</span>
                    {commentCount > 0 ? (
                        <Badge
                            variant="secondary"
                            className="pointer-events-none absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 font-mono text-[9px] tabular-nums"
                        >
                            {commentCount}
                        </Badge>
                    ) : null}
                </Button>
            </div>
        </header>
    );
}
