import { ConnectionBanner } from "@/components/ConnectionBanner";
import { EmptyState } from "@/components/EmptyState";
import { HeaderShell } from "@/components/Header";
import { DiffViewer } from "@/DiffViewer";
import { fetchRepos } from "@/lib/fetchRepos";
import { repoBasename } from "@/lib/format";
import { useHubConnection } from "@/lib/useHubConnection";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RepoInfo } from "@/lib/types";

type RepoListState =
    | { kind: "loading" }
    // The hub API is unavailable (e.g. an older server): fall back to the
    // single-repo viewer with legacy storage keys and no dropdown.
    | { kind: "unavailable" }
    | { kind: "ready"; repos: RepoInfo[] };

function repoIdFromUrl(): string | null {
    return new URLSearchParams(window.location.search).get("repo");
}

function writeRepoIdToUrl(id: string | undefined): void {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("repo", id);
    else url.searchParams.delete("repo");
    history.replaceState(null, "", url);
}

export default function App() {
    const [repoList, setRepoList] = useState<RepoListState>({ kind: "loading" });
    const [selectedRepoId, setSelectedRepoId] = useState<string | undefined>(undefined);
    const [bannerNote, setBannerNote] = useState<string | null>(null);
    const selectedRepoIdRef = useRef(selectedRepoId);
    selectedRepoIdRef.current = selectedRepoId;

    useEffect(() => {
        let cancelled = false;
        fetchRepos()
            .then((res) => {
                if (cancelled) return;
                const urlRepoId = repoIdFromUrl();
                const initial =
                    res.repos.find((repo) => repo.id === urlRepoId) ??
                    res.repos.find((repo) => repo.isHub) ??
                    res.repos[0];
                setSelectedRepoId(initial?.id);
                writeRepoIdToUrl(initial?.id);
                setRepoList({ kind: "ready", repos: res.repos });
            })
            .catch(() => {
                if (!cancelled) setRepoList({ kind: "unavailable" });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const refreshRepos = useCallback((opts: { noteSwitch?: boolean } = {}) => {
        fetchRepos()
            .then((res) => {
                setRepoList({ kind: "ready", repos: res.repos });
                const current = selectedRepoIdRef.current;
                if (current && res.repos.some((repo) => repo.id === current)) return;
                const fallback = res.repos.find((repo) => repo.isHub) ?? res.repos[0];
                if (!fallback) return;
                if (current && opts.noteSwitch) {
                    setBannerNote(`switched to ${repoBasename(fallback.repoRoot)}`);
                }
                setSelectedRepoId(fallback.id);
                writeRepoIdToUrl(fallback.id);
            })
            .catch(() => {
                // keep the last known list; the connection banner covers a dead server
            });
    }, []);

    useEffect(() => {
        const onFocus = () => refreshRepos();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [refreshRepos]);

    const onHubChanged = useCallback(() => refreshRepos({ noteSwitch: true }), [refreshRepos]);
    const status = useHubConnection(repoList.kind === "ready", onHubChanged);

    useEffect(() => {
        if (status === "connected") setBannerNote(null);
    }, [status]);

    const selectRepo = useCallback((id: string) => {
        setSelectedRepoId(id);
        writeRepoIdToUrl(id);
    }, []);

    if (repoList.kind === "loading") {
        return (
            <div className="bg-background flex h-screen flex-col overflow-hidden">
                <HeaderShell />
                <div className="relative min-h-0 flex-1">
                    <EmptyState kind="loading" title="Loading…" />
                </div>
            </div>
        );
    }

    return (
        <>
            <DiffViewer
                key={selectedRepoId ?? "local"}
                repoId={selectedRepoId}
                repos={repoList.kind === "ready" ? repoList.repos : []}
                onRepoChange={selectRepo}
                refreshRepos={refreshRepos}
                onUnknownRepo={onHubChanged}
                reconnecting={status === "reconnecting"}
            />
            <ConnectionBanner status={status} note={bannerNote} />
        </>
    );
}
