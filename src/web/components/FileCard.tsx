import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fileCardId } from "@/lib/slug";
import { PatchDiff } from "@pierre/diffs/react";
import {
    ChevronDown,
    ChevronRight,
    Copy,
    FilePlus,
    FileMinus,
    FilePen,
    FileBox,
    ArrowRight,
} from "lucide-react";

import type { ViewMode } from "@/components/ViewToggle";
import type { ParsedFile, FileStatus } from "@/lib/types";

interface Props {
    file: ParsedFile;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    viewMode: ViewMode;
    onActivated?: (path: string) => void;
}

const STATUS_LABEL: Record<FileStatus, string> = {
    added: "added",
    modified: "modified",
    deleted: "deleted",
    renamed: "renamed",
    untracked: "untracked",
};

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

function StatusIcon({ status }: { status: FileStatus }) {
    const cls = "size-3.5";
    if (status === "added") return <FilePlus className={cls} />;
    if (status === "deleted") return <FileMinus className={cls} />;
    if (status === "renamed") return <ArrowRight className={cls} />;
    if (status === "untracked") return <FileBox className={cls} />;
    return <FilePen className={cls} />;
}

export function FileCard({ file, open, onOpenChange, viewMode, onActivated: _onActivated }: Props) {
    return (
        <div
            id={fileCardId(file.path)}
            className="bg-card overflow-hidden rounded-xl border shadow-sm"
            data-file-path={file.path}
        >
            <Collapsible open={open} onOpenChange={onOpenChange}>
                <div className="bg-card/95 sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-2 backdrop-blur">
                    <CollapsibleTrigger asChild>
                        <button className="flex min-w-0 flex-1 items-center gap-2 text-left">
                            {open ? (
                                <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                            ) : (
                                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                            )}
                            <StatusIcon status={file.status} />
                            <span className="truncate font-mono text-sm" title={file.path}>
                                {file.oldPath ? (
                                    <>
                                        <span className="text-muted-foreground line-through">
                                            {file.oldPath}
                                        </span>
                                        <span className="text-muted-foreground mx-1.5">→</span>
                                        {file.path}
                                    </>
                                ) : (
                                    file.path
                                )}
                            </span>
                        </button>
                    </CollapsibleTrigger>
                    <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={STATUS_VARIANT[file.status]} className="capitalize">
                            {STATUS_LABEL[file.status]}
                        </Badge>
                        <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                            +{file.additions}
                        </span>
                        <span className="font-mono text-xs text-rose-600 dark:text-rose-400">
                            −{file.deletions}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => navigator.clipboard?.writeText(file.path)}
                            title="Copy path"
                        >
                            <Copy className="size-3.5" />
                        </Button>
                    </div>
                </div>
                <CollapsibleContent>
                    <div className="px-3 py-2">
                        {file.skipped ? (
                            <div className="bg-muted text-muted-foreground rounded-md px-3 py-6 text-center text-sm">
                                {file.skipped.reason === "binary"
                                    ? "Binary file — preview skipped."
                                    : "File too large — preview skipped."}
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-md border">
                                <PatchDiff
                                    patch={file.rawPatch}
                                    options={{ diffStyle: viewMode, disableFileHeader: true }}
                                />
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
