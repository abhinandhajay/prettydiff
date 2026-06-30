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

export function FileTreePanelContent({ files, activePath, onScrollTo }: Props) {
    const { paths, gitStatus, counts, totalAdd, totalDel } = useMemo(() => {
        const paths: string[] = [];
        const gitStatus: { path: string; status: ParsedFile["status"] }[] = [];
        const counts = { added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0 };
        let totalAdd = 0;
        let totalDel = 0;
        for (const f of files) {
            paths.push(f.path);
            gitStatus.push({ path: f.path, status: f.status });
            counts[f.status] = (counts[f.status] ?? 0) + 1;
            totalAdd += f.additions;
            totalDel += f.deletions;
        }
        return { paths, gitStatus, counts, totalAdd, totalDel };
    }, [files]);

    const totalChanged = totalAdd + totalDel;
    const addPct = totalChanged === 0 ? 0 : (totalAdd / totalChanged) * 100;
    const delPct = totalChanged === 0 ? 0 : (totalDel / totalChanged) * 100;

    const pathsKey = useMemo(() => paths.join("\n"), [paths]);
    const gitKey = useMemo(
        () => gitStatus.map((g) => `${g.path}:${g.status}`).join("\n"),
        [gitStatus],
    );
    const dirPaths = useMemo(() => {
        const dirs = new Set<string>();
        for (const p of paths) {
            let idx = p.indexOf("/");
            while (idx !== -1) {
                dirs.add(p.slice(0, idx));
                idx = p.indexOf("/", idx + 1);
            }
        }
        return [...dirs];
    }, [paths]);

    const onScrollToRef = useRef(onScrollTo);
    useEffect(() => {
        onScrollToRef.current = onScrollTo;
    }, [onScrollTo]);

    const pathsRef = useRef(paths);
    useEffect(() => {
        pathsRef.current = paths;
    }, [paths]);

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
            if (pathsRef.current.includes(last)) {
                onScrollToRef.current(last);
            }
        },
    });

    // useFileTree builds the model once and never reacts to prop changes, so on
    // reload we push the new working-tree state into the existing model. Reset
    // the paths only when the file set changes (re-opening directories so the
    // tree stays expanded); a status-only change just updates git status and
    // keeps the current expansion.
    const treeSyncRef = useRef<{ paths: string; git: string } | null>(null);
    useEffect(() => {
        const prev = treeSyncRef.current;
        treeSyncRef.current = { paths: pathsKey, git: gitKey };
        if (!prev) return;
        if (prev.paths !== pathsKey) {
            model.resetPaths(paths, { initialExpandedPaths: dirPaths });
            model.setGitStatus(gitStatus);
        } else if (prev.git !== gitKey) {
            model.setGitStatus(gitStatus);
        }
    }, [model, pathsKey, gitKey, paths, gitStatus, dirPaths]);

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
                :host {
                    --trees-selected-bg: color-mix(in oklab, var(--color-primary) 17%, transparent);
                    --trees-selected-fg: var(--color-foreground);
                    --trees-row-hover-bg: color-mix(in oklab, var(--color-muted) 55%, transparent);
                }
                [data-item-selected="true"] {
                    color: inherit;
                    background-color: transparent;
                    --truncate-marker-background-overlay-color: transparent;
                }
                [data-item-selected="true"]::before {
                    outline-color: transparent;
                }
                [data-item-git-status="modified"] [data-item-section="git"] {
                    color: var(--color-muted-foreground);
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
        <>
            <div className="border-sidebar-border flex h-10 shrink-0 items-center justify-between border-b px-3">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10px] font-medium tracking-[0.13em] uppercase">
                        Files
                    </span>
                    <span className="text-foreground/80 font-mono text-[10.5px] tabular-nums">
                        {files.length}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
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
                            className="text-muted-foreground flex items-center gap-1"
                            title={`${counts.modified} modified`}
                        >
                            <span
                                aria-hidden
                                className="bg-muted-foreground/70 size-1.5 rounded-full"
                            />
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
            <div className="border-sidebar-border shrink-0 border-t px-3 pt-2.5 pb-3">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-muted-foreground text-[10px] font-medium tracking-[0.13em] uppercase">
                        Diff stats
                    </span>
                    <button
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px] transition-colors"
                        title="Jump to top"
                        onClick={() => {
                            const first = files[0];
                            if (first) {
                                const card = document.getElementById(fileCardId(first.path));
                                card?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }
                        }}
                    >
                        <ArrowUpToLine className="size-3" />
                        top
                    </button>
                </div>
                <dl className="space-y-1 font-mono text-[11px] tabular-nums">
                    <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Files</dt>
                        <dd className="text-foreground/90 font-medium">{files.length}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Additions</dt>
                        <dd className="font-medium text-emerald-600 dark:text-emerald-400">
                            +{totalAdd}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Deletions</dt>
                        <dd className="font-medium text-rose-600 dark:text-rose-400">
                            −{totalDel}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Lines</dt>
                        <dd className="text-foreground/90 font-medium">{totalChanged}</dd>
                    </div>
                </dl>
                <div
                    className="bg-border/70 mt-2.5 flex h-1 w-full overflow-hidden rounded-full"
                    aria-hidden
                >
                    <div className="h-full bg-emerald-400/80" style={{ width: `${addPct}%` }} />
                    <div className="h-full bg-rose-400/80" style={{ width: `${delPct}%` }} />
                </div>
            </div>
        </>
    );
}

export function FileTreeSidebar(props: Props) {
    return (
        <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full min-h-0 flex-col overflow-hidden border-r">
            <FileTreePanelContent {...props} />
        </aside>
    );
}
