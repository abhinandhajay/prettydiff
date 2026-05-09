import { fileCardId } from "@/lib/slug";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useMemo, useRef } from "react";

import type { ParsedFile } from "@/lib/types";

interface Props {
    files: ParsedFile[];
    activePath: string | null;
    onScrollTo: (path: string) => void;
}

export function FileTreeSidebar({ files, activePath, onScrollTo }: Props) {
    const paths = useMemo(() => files.map((f) => f.path), [files]);

    const gitStatus = useMemo(
        () =>
            files.map((f) => ({
                path: f.path,
                status: f.status,
            })),
        [files],
    );

    const onScrollToRef = useRef(onScrollTo);
    useEffect(() => {
        onScrollToRef.current = onScrollTo;
    }, [onScrollTo]);

    const { model } = useFileTree({
        paths,
        initialExpansion: "open",
        gitStatus,
        flattenEmptyDirectories: true,
        dragAndDrop: false,
        renaming: false,
        onSelectionChange: (selected) => {
            const last = selected[selected.length - 1];
            if (!last) return;
            // Only fire for file paths we know about (skip directory selections)
            if (paths.includes(last)) {
                onScrollToRef.current(last);
            }
        },
    });

    // Keep tree selection in sync with the file currently in view (driven by IntersectionObserver in App).
    useEffect(() => {
        if (!activePath) return;
        const id = window.requestAnimationFrame(() => {
            const el = document.querySelector<HTMLElement>(
                `[data-prettydiff-tree-row="${cssEscape(activePath)}"]`,
            );
            el?.scrollIntoView({ block: "nearest" });
        });
        return () => window.cancelAnimationFrame(id);
    }, [activePath]);

    return (
        <aside className="bg-sidebar text-sidebar-foreground flex h-full min-h-0 flex-col overflow-hidden border-r">
            <div className="text-muted-foreground flex h-10 items-center border-b px-3 text-xs font-semibold tracking-wide uppercase">
                Files
            </div>
            <div className="flex-1 overflow-hidden">
                <FileTree model={model} className="h-full w-full" />
            </div>
            <div className="text-muted-foreground border-t px-3 py-2 text-xs">
                {files.length} file{files.length === 1 ? "" : "s"} ·{" "}
                <button
                    className="underline-offset-2 hover:underline"
                    onClick={() => {
                        const first = files[0];
                        if (first) {
                            const card = document.getElementById(fileCardId(first.path));
                            card?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                    }}
                >
                    jump to top
                </button>
            </div>
        </aside>
    );
}

function cssEscape(s: string): string {
    // CSS.escape isn't available everywhere; this is sufficient for our path strings.
    return s.replace(/["\\]/g, "\\$&");
}
