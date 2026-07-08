import { describe, expect, test } from "bun:test";

import { HubRegistry, repoIdFor } from "./registry.js";

describe("repoIdFor", () => {
    test("is deterministic and 12 hex chars", () => {
        expect(repoIdFor("/a/b/repo")).toBe(repoIdFor("/a/b/repo"));
        expect(repoIdFor("/a/b/repo")).toMatch(/^[0-9a-f]{12}$/);
    });

    test("differs per path", () => {
        expect(repoIdFor("/a/repo")).not.toBe(repoIdFor("/b/repo"));
    });
});

describe("HubRegistry", () => {
    test("same repo from two clients is one entry; last unregister removes it", () => {
        const registry = new HubRegistry();
        const repo = registry.register("/a/repo", "c1");
        expect(registry.register("/a/repo", "c2").id).toBe(repo.id);
        expect(registry.list()).toHaveLength(1);

        registry.unregister(repo.id, "c1");
        expect(registry.list()).toHaveLength(1);
        registry.unregister(repo.id, "c2");
        expect(registry.list()).toHaveLength(0);
    });

    test("unregister is idempotent for unknown ids", () => {
        const registry = new HubRegistry();
        registry.unregister("nope", "c1");
        expect(registry.list()).toHaveLength(0);
    });

    test("heartbeat returns false for unknown (repo, client) pairs", () => {
        const registry = new HubRegistry();
        const repo = registry.register("/a/repo", "c1");
        expect(registry.heartbeat(repo.id, "c1")).toBe(true);
        expect(registry.heartbeat(repo.id, "other")).toBe(false);
        expect(registry.heartbeat("nope", "c1")).toBe(false);
    });

    test("prune drops stale clients but never the hub client", () => {
        let now = 0;
        const registry = new HubRegistry({ now: () => now, staleMs: 15_000 });
        registry.register("/hub/repo", "hub-client", { isHub: true });
        const other = registry.register("/other/repo", "c1");

        now = 14_999;
        registry.prune();
        expect(registry.list()).toHaveLength(2);

        now = 15_001;
        registry.prune();
        expect(registry.list()).toHaveLength(1);
        expect(registry.resolveRepoRoot(other.id)).toBeNull();
        expect(registry.resolveRepoRoot(undefined)).toBe("/hub/repo");
    });

    test("heartbeat refreshes the prune clock", () => {
        let now = 0;
        const registry = new HubRegistry({ now: () => now, staleMs: 15_000 });
        const repo = registry.register("/a/repo", "c1");
        now = 10_000;
        registry.heartbeat(repo.id, "c1");
        now = 20_000;
        registry.prune();
        expect(registry.list()).toHaveLength(1);
    });

    test("list puts the hub repo first, rest sorted by basename", () => {
        const registry = new HubRegistry();
        registry.register("/x/zebra", "c1");
        registry.register("/x/alpha", "c2");
        registry.register("/x/hub", "hub-client", { isHub: true });
        expect(registry.list().map((repo) => repo.repoRoot)).toEqual([
            "/x/hub",
            "/x/alpha",
            "/x/zebra",
        ]);
    });

    test("resolveRepoRoot: undefined resolves to the hub repo, unknown id to null", () => {
        const registry = new HubRegistry();
        registry.register("/hub/repo", "hub-client", { isHub: true });
        const other = registry.register("/other/repo", "c1");
        expect(registry.resolveRepoRoot(undefined)).toBe("/hub/repo");
        expect(registry.resolveRepoRoot(other.id)).toBe("/other/repo");
        expect(registry.resolveRepoRoot("nope")).toBeNull();
    });
});
