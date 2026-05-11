import { Button } from "@/components/ui/button";
import { ViewToggle, type ViewMode } from "@/components/ViewToggle";
import { GitBranch, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useMemo } from "react";

import type { DiffPayload } from "@/lib/types";

interface Props {
    payload: DiffPayload;
    viewMode: ViewMode;
    onViewModeChange: (v: ViewMode) => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
}

function repoBasename(repoRoot: string): string {
    const parts = repoRoot.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] ?? repoRoot;
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
            className="bg-border/60 relative h-[5px] w-20 overflow-hidden rounded-full"
            aria-hidden
        >
            <div
                className="h-full bg-emerald-500/80"
                style={{ width: `${addPct}%`, float: "left" }}
            />
            <div className="h-full bg-rose-500/80" style={{ width: `${delPct}%`, float: "left" }} />
        </div>
    );
}

function Divider() {
    return <span aria-hidden className="bg-border/70 h-4 w-px shrink-0" />;
}

export function Header({ payload, viewMode, onViewModeChange, onExpandAll, onCollapseAll }: Props) {
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
        <header className="bg-background/70 supports-[backdrop-filter]:bg-background/55 relative sticky top-0 isolate z-20 flex h-14 items-center justify-between gap-4 border-b px-4 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-primary bg-primary/10 ring-primary/25 inline-flex size-7 items-center justify-center rounded-md ring-1">
                        <LogoMark className="size-4" />
                    </span>
                    <span className="text-foreground text-[15px] font-semibold tracking-tight">
                        prettydiff
                    </span>
                </div>
                <Divider />
                <div className="text-muted-foreground hidden min-w-0 items-center gap-2.5 text-[13px] md:flex">
                    <span
                        className="text-foreground/85 truncate font-medium"
                        title={payload.repoRoot}
                    >
                        {repoBasename(payload.repoRoot)}
                    </span>
                    <span className="border-border/70 bg-muted/40 text-foreground/85 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]">
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
            <div className="flex items-center gap-3">
                <div className="hidden items-center gap-3 sm:flex">
                    <div className="flex items-center gap-1.5 text-[13px]">
                        <span className="text-foreground font-mono font-semibold tabular-nums">
                            {payload.files.length}
                        </span>
                        <span className="text-muted-foreground">
                            file{payload.files.length === 1 ? "" : "s"}
                        </span>
                    </div>
                    <Divider />
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] text-emerald-400 tabular-nums">
                            +{totals.add}
                        </span>
                        <span className="font-mono text-[12px] text-rose-400 tabular-nums">
                            −{totals.del}
                        </span>
                        <RatioBar add={totals.add} del={totals.del} />
                    </div>
                </div>
                <Divider />
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onExpandAll}
                        title="Expand all files"
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <ChevronsUpDown />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onCollapseAll}
                        title="Collapse all files"
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <ChevronsDownUp />
                    </Button>
                </div>
                <ViewToggle value={viewMode} onChange={onViewModeChange} />
            </div>
        </header>
    );
}
