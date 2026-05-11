import { fileCardId } from "@/lib/slug";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { ArrowUpToLine } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import type { ParsedFile } from "@/lib/types";

interface Props {
    files: ParsedFile[];
    activePath: string | null;
    onScrollTo: (path: string) => void;
}

export function FileTreeSidebar({ files, activePath, onScrollTo }: Props) {
    const { paths, gitStatus, counts } = useMemo(() => {
        const paths: string[] = [];
        const gitStatus: { path: string; status: ParsedFile["status"] }[] = [];
        const counts = { added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0 };
        for (const f of files) {
            paths.push(f.path);
            gitStatus.push({ path: f.path, status: f.status });
            counts[f.status] = (counts[f.status] ?? 0) + 1;
        }
        return { paths, gitStatus, counts };
    }, [files]);

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
            if (paths.includes(last)) {
                onScrollToRef.current(last);
            }
        },
    });

    const activeStyleRef = useRef<HTMLStyleElement | null>(null);
    useEffect(() => {
        let cancelled = false;
        let raf = 0;
        const apply = () => {
            if (cancelled) return;
            const host = model.getFileTreeContainer();
            const shadow = host?.shadowRoot;
            if (!shadow) {
                raf = window.requestAnimationFrame(apply);
                return;
            }
            let style = activeStyleRef.current;
            if (!style || style.parentNode !== shadow) {
                style = document.createElement("style");
                style.setAttribute("data-prettydiff-active-row", "");
                shadow.appendChild(style);
                activeStyleRef.current = style;
            }
            const escaped = activePath ? CSS.escape(activePath) : "";
            style.textContent = `
                [data-item-selected="true"] {
                    color: inherit;
                    background-color: transparent;
                    --truncate-marker-background-overlay-color: transparent;
                }
                [data-item-selected="true"]::before {
                    outline-color: transparent;
                }
                ${
                    activePath
                        ? `[data-item-path="${escaped}"] {
                              color: var(--trees-selected-fg);
                              background-color: var(--trees-selected-bg);
                              --truncate-marker-background-overlay-color: var(--trees-selected-bg);
                          }
                          [data-item-path="${escaped}"] [data-item-section="icon"] {
                              color: var(--trees-selected-fg);
                          }`
                        : ""
                }
            `;
        };
        apply();
        return () => {
            cancelled = true;
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, [model, activePath]);
    useEffect(
        () => () => {
            activeStyleRef.current?.remove();
            activeStyleRef.current = null;
        },
        [],
    );

    return (
        <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full min-h-0 flex-col overflow-hidden border-r">
            <div className="border-sidebar-border flex h-12 shrink-0 items-center justify-between border-b px-3">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10.5px] font-medium tracking-[0.12em] uppercase">
                        Changes
                    </span>
                    <span className="text-foreground/90 font-mono text-[11px] tabular-nums">
                        {files.length}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10.5px]">
                    {counts.added > 0 && (
                        <span
                            className="flex items-center gap-1 text-emerald-400/90"
                            title={`${counts.added} added`}
                        >
                            <span aria-hidden className="size-1.5 rounded-full bg-emerald-400/80" />
                            {counts.added}
                        </span>
                    )}
                    {counts.modified > 0 && (
                        <span
                            className="text-primary/90 flex items-center gap-1"
                            title={`${counts.modified} modified`}
                        >
                            <span aria-hidden className="bg-primary/80 size-1.5 rounded-full" />
                            {counts.modified}
                        </span>
                    )}
                    {counts.deleted > 0 && (
                        <span
                            className="flex items-center gap-1 text-rose-400/90"
                            title={`${counts.deleted} deleted`}
                        >
                            <span aria-hidden className="size-1.5 rounded-full bg-rose-400/80" />
                            {counts.deleted}
                        </span>
                    )}
                    {counts.untracked > 0 && (
                        <span
                            className="flex items-center gap-1 text-amber-400/90"
                            title={`${counts.untracked} untracked`}
                        >
                            <span aria-hidden className="size-1.5 rounded-full bg-amber-400/80" />
                            {counts.untracked}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-hidden">
                <FileTree model={model} className="h-full w-full" />
            </div>
            <div className="border-sidebar-border text-muted-foreground flex h-9 shrink-0 items-center justify-between border-t px-3 text-[11px]">
                <span className="font-mono">
                    {files.length} file{files.length === 1 ? "" : "s"}
                </span>
                <button
                    className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                    onClick={() => {
                        const first = files[0];
                        if (first) {
                            const card = document.getElementById(fileCardId(first.path));
                            card?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                    }}
                >
                    <ArrowUpToLine className="size-3" />
                    jump to top
                </button>
            </div>
        </aside>
    );
}
