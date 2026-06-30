import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ViewToggle, type ViewMode } from "@/components/ViewToggle";
import { repoBasename } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    ChevronsDownUp,
    ChevronsUpDown,
    GitBranch,
    GitCommitHorizontal,
    MessageSquare,
    RefreshCw,
    WrapText,
} from "lucide-react";

import type { DiffPayload } from "@/lib/types";

interface Props {
    payload: DiffPayload;
    viewMode: ViewMode;
    onViewModeChange: (v: ViewMode) => void;
    wrap: boolean;
    onWrapChange: (w: boolean) => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    allExpanded: boolean;
    onReload: () => void;
    isReloading: boolean;
    target: "working-tree" | "branch";
    onTargetChange: (target: "working-tree" | "branch") => void;
    targetRef?: string;
    onTargetRefChange: (targetRef: string) => void;
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
    allExpanded,
    onReload,
    isReloading,
    target,
    onTargetChange,
    targetRef,
    onTargetRefChange,
    showComments,
    onShowCommentsChange,
    commentCount,
}: Props) {
    const branchOptions = payload.branches.filter((branch) => !branch.current);
    const fallbackTargetRef = branchOptions[0]?.name ?? payload.branch;
    const selectedTargetRef = targetRef ?? payload.targetRef ?? fallbackTargetRef;

    const changeTarget = (nextTarget: "working-tree" | "branch") => {
        onTargetChange(nextTarget);
        if (nextTarget === "branch" && !targetRef) onTargetRefChange(selectedTargetRef);
    };

    return (
        <header className="bg-background isolate z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3">
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground bg-card border-border inline-flex size-7 items-center justify-center rounded-md border">
                        <LogoMark className="size-4" />
                    </span>
                    <span className="text-foreground text-[14px] font-semibold tracking-tight">
                        prettydiff
                    </span>
                </div>
                <Divider />
                <div className="hidden min-w-0 items-center gap-2 md:flex">
                    <span
                        className="text-foreground/85 truncate text-[13px] font-medium"
                        title={payload.repoRoot}
                    >
                        {repoBasename(payload.repoRoot)}
                    </span>
                    <span
                        className="text-foreground/80 bg-muted/60 inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-md px-2 font-mono text-[11.5px]"
                        title={`Current branch: ${payload.branch}`}
                    >
                        <GitBranch className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="truncate">{payload.branch}</span>
                    </span>
                    <span className="text-muted-foreground text-[11.5px]">vs</span>
                    <ToggleGroup
                        type="single"
                        value={target}
                        onValueChange={(value) => {
                            if (value === "working-tree" || value === "branch") changeTarget(value);
                        }}
                        className="bg-muted/60 inline-flex h-8 items-center gap-0.5 rounded-md p-0.5"
                    >
                        <ToggleGroupItem
                            value="working-tree"
                            aria-label="Compare to working tree"
                            className="text-muted-foreground hover:bg-card/60 hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground h-7 rounded-[5px] border-0 bg-transparent px-2.5 text-[11.5px] font-medium tracking-tight transition-colors data-[state=on]:shadow-sm"
                        >
                            Working tree
                        </ToggleGroupItem>
                        <ToggleGroupItem
                            value="branch"
                            aria-label="Compare to branch"
                            className="text-muted-foreground hover:bg-card/60 hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground h-7 rounded-[5px] border-0 bg-transparent px-2.5 text-[11.5px] font-medium tracking-tight transition-colors data-[state=on]:shadow-sm"
                        >
                            Branch
                        </ToggleGroupItem>
                    </ToggleGroup>
                    {target === "branch" ? (
                        <Select value={selectedTargetRef} onValueChange={onTargetRefChange}>
                            <SelectTrigger
                                aria-label="Target branch"
                                title={`Target branch: ${selectedTargetRef}`}
                                className="bg-muted/60 text-foreground/80 h-7 w-auto max-w-[220px] justify-start gap-1.5 border-0 px-2 font-mono text-[11.5px] shadow-none [&>span]:max-w-[160px]"
                            >
                                <GitBranch className="text-muted-foreground size-3.5 shrink-0" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="start">
                                {branchOptions.map((branch) => (
                                    <SelectItem
                                        key={branch.name}
                                        value={branch.name}
                                        className="font-mono text-[11.5px]"
                                    >
                                        {branch.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}
                    {payload.head ? (
                        <span
                            className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[11.5px]"
                            title={`Commit: ${payload.head}`}
                        >
                            <GitCommitHorizontal className="size-3.5 shrink-0" />
                            {payload.head.slice(0, 7)}
                        </span>
                    ) : null}
                </div>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
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
                        onClick={allExpanded ? onCollapseAll : onExpandAll}
                        title={allExpanded ? "Collapse all files" : "Expand all files"}
                        className="text-muted-foreground hover:text-foreground size-8 px-0"
                    >
                        {allExpanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
                    </Button>
                </div>
                <Divider />
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
