import { CommentsPanelContent } from "@/components/CommentsSidebar";
import { FileTreePanelContent } from "@/components/FileTreeSidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { Files, MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import type { CommentMap, ParsedFile } from "@/lib/types";

export type ReviewSidebarTab = "changes" | "comments";

interface Props {
    open: boolean;
    activeTab: ReviewSidebarTab;
    onOpenChange: (open: boolean) => void;
    onTabChange: (tab: ReviewSidebarTab) => void;
    files: ParsedFile[];
    activePath: string | null;
    onScrollToFile: (path: string) => void;
    comments: CommentMap;
    totalCommentCount: number;
    selectedCommentIds: Set<string>;
    onToggleSelectedComment: (id: string) => void;
    onToggleFileComments: (filePath: string, select: boolean) => void;
    onEditComment: (id: string, body: string) => void;
    onDeleteComment: (id: string) => void;
    onCopyComments: () => void;
    scrollToCommentId: string | null;
    onCommentScrollHandled: () => void;
    onJumpToDiffComment: (id: string) => void;
}

interface CollapsedReviewRailProps {
    files: ParsedFile[];
    totalCommentCount: number;
    onOpen: () => void;
}

export function CollapsedReviewRail({
    files,
    totalCommentCount,
    onOpen,
}: CollapsedReviewRailProps) {
    const totals = files.reduce(
        (acc, file) => ({
            additions: acc.additions + file.additions,
            deletions: acc.deletions + file.deletions,
        }),
        { additions: 0, deletions: 0 },
    );

    return (
        <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full w-full flex-col items-center overflow-hidden border-r">
            <div className="border-sidebar-border flex h-12 w-full shrink-0 items-center justify-center border-b">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onOpen}
                    title="Show sidebar"
                    className="text-muted-foreground hover:text-foreground size-8"
                >
                    <PanelLeftOpen className="size-4" />
                </Button>
            </div>
            <div className="flex w-full flex-1 flex-col items-center gap-2 px-1.5 py-2">
                <div
                    className="bg-muted/55 border-sidebar-border flex w-full flex-col items-center gap-1 rounded-md border py-2"
                    title={`${files.length} changed files`}
                >
                    <Files className="text-muted-foreground size-3.5" />
                    <span className="text-foreground/85 font-mono text-[10.5px] font-medium tabular-nums">
                        {files.length}
                    </span>
                </div>
                <div
                    className="bg-muted/55 border-sidebar-border flex w-full flex-col items-center gap-1 rounded-md border py-2"
                    title={`${totalCommentCount} comments`}
                >
                    <MessageSquare className="text-muted-foreground size-3.5" />
                    <span className="text-foreground/85 font-mono text-[10.5px] font-medium tabular-nums">
                        {totalCommentCount}
                    </span>
                </div>
                <div
                    className="border-sidebar-border mt-auto flex w-full flex-col items-center gap-1 border-t pt-2 pb-1 font-mono text-[10px] tabular-nums"
                    title={`${totals.additions} additions, ${totals.deletions} deletions`}
                >
                    <span className="text-emerald-500 dark:text-emerald-400">
                        +{totals.additions}
                    </span>
                    <span className="text-rose-500 dark:text-rose-400">-{totals.deletions}</span>
                </div>
            </div>
        </aside>
    );
}

export function ReviewSidebar({
    open,
    activeTab,
    onOpenChange,
    onTabChange,
    files,
    activePath,
    onScrollToFile,
    comments,
    totalCommentCount,
    selectedCommentIds,
    onToggleSelectedComment,
    onToggleFileComments,
    onEditComment,
    onDeleteComment,
    onCopyComments,
    scrollToCommentId,
    onCommentScrollHandled,
    onJumpToDiffComment,
}: Props) {
    return (
        <aside
            data-state={open ? "open" : "closed"}
            className={cn(
                "bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full min-w-0 flex-col overflow-hidden border-r",
                "transition-[transform,opacity] duration-280 ease-[cubic-bezier(0.32,0.72,0,1)]",
                "data-[state=closed]:-translate-x-full data-[state=closed]:opacity-0",
            )}
            aria-hidden={!open}
        >
            <div className="border-sidebar-border flex h-12 shrink-0 items-center gap-2 border-b px-2.5">
                <ToggleGroup
                    type="single"
                    value={activeTab}
                    onValueChange={(value) => {
                        if (value === "changes" || value === "comments") onTabChange(value);
                    }}
                    className="bg-muted/60 grid h-8 min-w-0 flex-1 grid-cols-2 gap-0.5 rounded-md p-0.5"
                >
                    <ToggleGroupItem
                        value="changes"
                        aria-label="Show changed files"
                        className="text-muted-foreground hover:bg-card/60 hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground h-7 min-w-0 rounded-[5px] border-0 bg-transparent px-2 text-[11.5px] font-medium tracking-tight transition-colors data-[state=on]:shadow-sm"
                    >
                        <Files className="size-3.5" />
                        <span className="min-w-0 truncate">Changes</span>
                        <span className="font-mono text-[10.5px] tabular-nums opacity-75">
                            {files.length}
                        </span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="comments"
                        aria-label="Show comments"
                        className="text-muted-foreground hover:bg-card/60 hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground h-7 min-w-0 rounded-[5px] border-0 bg-transparent px-2 text-[11.5px] font-medium tracking-tight transition-colors data-[state=on]:shadow-sm"
                    >
                        <MessageSquare className="size-3.5" />
                        <span className="min-w-0 truncate">Comments</span>
                        {totalCommentCount > 0 ? (
                            <Badge
                                variant="secondary"
                                className="h-4 min-w-4 rounded-full px-1 font-mono text-[9px] tabular-nums"
                            >
                                {totalCommentCount}
                            </Badge>
                        ) : null}
                    </ToggleGroupItem>
                </ToggleGroup>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onOpenChange(false)}
                    title="Collapse sidebar"
                    className="text-muted-foreground hover:text-foreground size-8 shrink-0"
                >
                    <PanelLeftClose className="size-4" />
                </Button>
            </div>
            {activeTab === "changes" ? (
                <FileTreePanelContent
                    files={files}
                    activePath={activePath}
                    onScrollTo={onScrollToFile}
                />
            ) : (
                <CommentsPanelContent
                    comments={comments}
                    totalCount={totalCommentCount}
                    selectedIds={selectedCommentIds}
                    onToggleSelected={onToggleSelectedComment}
                    onToggleFile={onToggleFileComments}
                    onEdit={onEditComment}
                    onDelete={onDeleteComment}
                    onCopy={onCopyComments}
                    scrollToId={scrollToCommentId}
                    onScrollHandled={onCommentScrollHandled}
                    onJumpToDiff={onJumpToDiffComment}
                />
            )}
        </aside>
    );
}
