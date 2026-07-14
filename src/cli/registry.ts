import { createHash } from "node:crypto";
import path from "node:path";

import type { RepoInfo } from "./types.js";

export function repoIdFor(repoRoot: string): string {
    return createHash("sha256").update(repoRoot).digest("hex").slice(0, 12);
}

interface RegistryEntry {
    repo: RepoInfo;
    clients: Map<string, number>;
}

export class HubRegistry {
    private entries = new Map<string, RegistryEntry>();
    private hubClientId: string | undefined;
    private now: () => number;
    private staleMs: number;

    constructor(opts: { now?: () => number; staleMs?: number } = {}) {
        this.now = opts.now ?? Date.now;
        this.staleMs = opts.staleMs ?? 15_000;
    }

    register(repoRoot: string, clientId: string, opts: { isHub?: boolean } = {}): RepoInfo {
        const id = repoIdFor(repoRoot);
        let entry = this.entries.get(id);
        if (!entry) {
            entry = { repo: { id, repoRoot }, clients: new Map() };
            this.entries.set(id, entry);
        }
        if (opts.isHub) {
            entry.repo.isHub = true;
            this.hubClientId = clientId;
        }
        entry.clients.set(clientId, this.now());
        return entry.repo;
    }

    heartbeat(repoId: string, clientId: string): boolean {
        const entry = this.entries.get(repoId);
        if (!entry || !entry.clients.has(clientId)) return false;
        entry.clients.set(clientId, this.now());
        return true;
    }

    unregister(repoId: string, clientId: string): void {
        const entry = this.entries.get(repoId);
        if (!entry) return;
        entry.clients.delete(clientId);
        if (entry.clients.size === 0) this.entries.delete(repoId);
    }

    prune(): void {
        const cutoff = this.now() - this.staleMs;
        for (const [id, entry] of this.entries) {
            for (const [clientId, lastBeat] of entry.clients) {
                if (clientId === this.hubClientId) continue;
                if (lastBeat < cutoff) entry.clients.delete(clientId);
            }
            if (entry.clients.size === 0) this.entries.delete(id);
        }
    }

    list(): RepoInfo[] {
        const repos = [...this.entries.values()].map((entry) => entry.repo);
        return repos.sort((a, b) => {
            if (a.isHub !== b.isHub) return a.isHub ? -1 : 1;
            return path.basename(a.repoRoot).localeCompare(path.basename(b.repoRoot));
        });
    }

    resolveRepoRoot(repoId: string | undefined): string | null {
        if (repoId === undefined) {
            for (const entry of this.entries.values()) {
                if (entry.repo.isHub) return entry.repo.repoRoot;
            }
            return null;
        }
        return this.entries.get(repoId)?.repo.repoRoot ?? null;
    }
}
