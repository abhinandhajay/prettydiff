import { EmptyState } from "@/components/EmptyState";
import { FileCard } from "@/components/FileCard";
import { FileTreeSidebar } from "@/components/FileTreeSidebar";
import { Header } from "@/components/Header";
import { fetchDiff } from "@/lib/fetchDiff";
import { fileCardId } from "@/lib/slug";
import { sortFilesForTree } from "@/lib/treeSort";
import { usePersistedState } from "@/lib/usePersistedState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ViewMode } from "@/components/ViewToggle";
import type { DiffPayload } from "@/lib/types";

export default function App() {
    const [payload, setPayload] = useState<DiffPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = usePersistedState<ViewMode>("prettydiff:view", "unified");
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
    const [activePath, setActivePath] = useState<string | null>(null);

    useEffect(() => {
        fetchDiff()
            .then((p) => {
                setPayload(p);
                const init: Record<string, boolean> = {};
                for (const f of p.files) init[f.path] = true;
                setOpenMap(init);
                if (p.files[0]) setActivePath(p.files[0].path);
            })
            .catch((e) => setError(e?.message ?? String(e)));
    }, []);

    const setOpen = useCallback((path: string, open: boolean) => {
        setOpenMap((m) => ({ ...m, [path]: open }));
    }, []);

    const expandAll = useCallback(() => {
        if (!payload) return;
        const m: Record<string, boolean> = {};
        for (const f of payload.files) m[f.path] = true;
        setOpenMap(m);
    }, [payload]);

    const collapseAll = useCallback(() => {
        if (!payload) return;
        const m: Record<string, boolean> = {};
        for (const f of payload.files) m[f.path] = false;
        setOpenMap(m);
    }, [payload]);

    const scrollToFile = useCallback((path: string) => {
        setOpenMap((m) => (m[path] ? m : { ...m, [path]: true }));
        requestAnimationFrame(() => {
            const el = document.getElementById(fileCardId(path));
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }, []);

    // IntersectionObserver: track which file is currently in view → drives sidebar active highlight.
    const cardsRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!payload || !cardsRef.current) return;
        const root = cardsRef.current;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
                const top = visible[0];
                if (top) {
                    const path = (top.target as HTMLElement).dataset.filePath;
                    if (path) setActivePath(path);
                }
            },
            {
                root,
                rootMargin: "-10% 0px -60% 0px",
                threshold: [0, 0.25, 0.5, 0.75, 1],
            },
        );
        const cards = root.querySelectorAll<HTMLElement>("[data-file-path]");
        cards.forEach((c) => observer.observe(c));
        return () => observer.disconnect();
    }, [payload]);

    const sortedFiles = useMemo(
        () => (payload ? sortFilesForTree(payload.files) : []),
        [payload],
    );

    if (error) {
        return <EmptyState title="Couldn't load diff" message={error} />;
    }
    if (!payload) {
        return <EmptyState title="Loading…" />;
    }
    if (payload.files.length === 0) {
        return <EmptyState title="No changes" message="Working tree matches HEAD." />;
    }

    return (
        <div className="bg-background flex h-screen flex-col overflow-hidden">
            <Header
                payload={payload}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
            />
            <div
                className="grid min-h-0 flex-1"
                style={{ gridTemplateColumns: "280px 1fr" }}
            >
                <FileTreeSidebar
                    files={sortedFiles}
                    activePath={activePath}
                    onScrollTo={scrollToFile}
                />
                <main ref={cardsRef} className="space-y-3 overflow-y-auto p-4">
                    {sortedFiles.map((f) => (
                        <FileCard
                            key={f.path}
                            file={f}
                            open={openMap[f.path] ?? true}
                            onOpenChange={(o) => setOpen(f.path, o)}
                            viewMode={viewMode}
                        />
                    ))}
                </main>
            </div>
        </div>
    );
}
