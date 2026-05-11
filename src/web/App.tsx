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

    const cardsRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!payload || !cardsRef.current) return;
        const root = cardsRef.current;
        const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-file-path]"));
        if (cards.length === 0) return;
        let raf = 0;
        const compute = () => {
            raf = 0;
            const rootTop = root.getBoundingClientRect().top;
            let active: string | null = cards[0]?.dataset.filePath ?? null;
            for (const card of cards) {
                if (card.getBoundingClientRect().top - rootTop <= 1) {
                    active = card.dataset.filePath ?? active;
                } else {
                    break;
                }
            }
            if (active) setActivePath(active);
        };
        const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(compute);
        };
        schedule();
        root.addEventListener("scroll", schedule, { passive: true });
        const ro = new ResizeObserver(schedule);
        ro.observe(root);
        cards.forEach((c) => ro.observe(c));
        return () => {
            root.removeEventListener("scroll", schedule);
            ro.disconnect();
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, [payload]);

    const sortedFiles = useMemo(() => (payload ? sortFilesForTree(payload.files) : []), [payload]);

    if (error) {
        return <EmptyState kind="error" title="Couldn't load diff" message={error} />;
    }
    if (!payload) {
        return <EmptyState kind="loading" title="Loading…" />;
    }
    if (payload.files.length === 0) {
        return <EmptyState kind="empty" title="No changes" message="Working tree matches HEAD." />;
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
                className="relative grid min-h-0 flex-1"
                style={{ gridTemplateColumns: "276px 1fr" }}
            >
                <FileTreeSidebar
                    files={sortedFiles}
                    activePath={activePath}
                    onScrollTo={scrollToFile}
                />
                <main ref={cardsRef} className="space-y-3 overflow-y-auto px-5 py-5">
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
