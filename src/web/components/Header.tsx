import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ViewToggle, type ViewMode } from "@/components/ViewToggle";
import { GitBranch, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

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

export function Header({ payload, viewMode, onViewModeChange, onExpandAll, onCollapseAll }: Props) {
    const totals = payload.files.reduce(
        (acc, f) => {
            acc.add += f.additions;
            acc.del += f.deletions;
            return acc;
        },
        { add: 0, del: 0 },
    );

    return (
        <header className="bg-background/80 sticky top-0 z-20 flex h-14 items-center justify-between border-b px-4 backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
                <div className="font-semibold tracking-tight">prettydiff</div>
                <div className="text-muted-foreground hidden min-w-0 items-center gap-2 text-sm md:flex">
                    <span className="truncate" title={payload.repoRoot}>
                        {repoBasename(payload.repoRoot)}
                    </span>
                    <span className="text-border">·</span>
                    <GitBranch className="size-3.5 shrink-0" />
                    <span className="font-mono text-xs">{payload.branch}</span>
                    {payload.head ? (
                        <>
                            <span className="text-border">·</span>
                            <span className="font-mono text-xs">{payload.head}</span>
                        </>
                    ) : null}
                </div>
            </div>
            <div className="flex items-center gap-3">
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <span className="text-foreground font-medium">{payload.files.length}</span>
                    <span>file{payload.files.length === 1 ? "" : "s"}</span>
                    <Badge variant="success" className="font-mono">
                        +{totals.add}
                    </Badge>
                    <Badge variant="destructive" className="font-mono">
                        −{totals.del}
                    </Badge>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onExpandAll}
                        title="Expand all files"
                    >
                        <ChevronsUpDown />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onCollapseAll}
                        title="Collapse all files"
                    >
                        <ChevronsDownUp />
                    </Button>
                </div>
                <ViewToggle value={viewMode} onChange={onViewModeChange} />
            </div>
        </header>
    );
}
