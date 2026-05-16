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
    const [isReloading, setIsReloading] = useState(false);
    const [viewMode, setViewMode] = usePersistedState<ViewMode>("prettydiff:view", "unified");
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
    const [activePath, setActivePath] = useState<string | null>(null);

    const loadDiff = useCallback((mode: "initial" | "reload") => {
        if (mode === "reload") setIsReloading(true);
        fetchDiff()
            .then((p) => {
                setPayload(p);
                if (mode === "initial") {
                    const init: Record<string, boolean> = {};
                    for (const f of p.files) init[f.path] = true;
                    setOpenMap(init);
                    if (p.files[0]) setActivePath(p.files[0].path);
                } else {
                    const present = new Set(p.files.map((f) => f.path));
                    setOpenMap((prev) => {
                        const next: Record<string, boolean> = {};
                        for (const f of p.files) {
                            next[f.path] = prev[f.path] ?? true;
                        }
                        return next;
                    });
                    setActivePath((prev) =>
                        prev && present.has(prev) ? prev : (p.files[0]?.path ?? null),
                    );
                }
            })
            .catch((e) => {
                if (mode === "initial") setError(e?.message ?? String(e));
                else console.warn("prettydiff: reload failed", e);
            })
            .finally(() => {
                if (mode === "reload") setIsReloading(false);
            });
    }, []);

    useEffect(() => {
        loadDiff("initial");
    }, [loadDiff]);

    const reload = useCallback(() => loadDiff("reload"), [loadDiff]);

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

    return (
        <div className="bg-background flex h-screen flex-col overflow-hidden">
            <Header
                payload={payload}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
                onReload={reload}
                isReloading={isReloading}
            />
            {payload.files.length === 0 ? (
                <EmptyState kind="empty" title="No changes" message="Working tree matches HEAD." />
            ) : (
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
            )}
        </div>
    );
}
