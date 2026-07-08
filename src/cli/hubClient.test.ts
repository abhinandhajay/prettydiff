import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverHub, probeHub, startInstance, type HubTimings } from "./hubClient.js";
import { HubRegistry, repoIdFor } from "./registry.js";
import { startServer, type StartedServer } from "./server.js";

import type { InstanceController } from "./hubClient.js";
import type { HubReposResponse } from "./types.js";

const TEST_TIMINGS: Partial<HubTimings> = {
    probeTimeoutMs: 250,
    heartbeatIntervalMs: 150,
    heartbeatTimeoutMs: 500,
    heartbeatRetryDelayMs: 100,
    takeoverJitterMaxMs: 50,
    takeoverRounds: 3,
    rejoinProbeAttempts: 10,
    rejoinProbeDelayMs: 50,
};

function git(args: string[], cwd: string): void {
    const r = Bun.spawnSync(["git", ...args], {
        cwd,
        env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
    });
    if (r.exitCode !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
    }
}

async function makeGitRepo(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prettydiff-hub-"));
    git(["init", "-q"], dir);
    git(
        [
            "-c",
            "user.email=test@example.com",
            "-c",
            "user.name=test",
            "commit",
            "--allow-empty",
            "-q",
            "-m",
            "init",
        ],
        dir,
    );
    return realpath(dir);
}

function makeHub(repoRoot: string, port = 0, hubId: string = crypto.randomUUID()) {
    const registry = new HubRegistry();
    registry.register(repoRoot, crypto.randomUUID(), { isHub: true });
    return startServer({ port, version: "0.0.0-test", hubId, registry });
}

function startTestInstance(
    repoRoot: string,
    preferredPort: number,
    clientId: string = crypto.randomUUID(),
): Promise<InstanceController> {
    return startInstance({
        repoRoot,
        clientId,
        version: "0.0.0-test",
        preferredPort,
        startHubServer: (port) => {
            const registry = new HubRegistry();
            registry.register(repoRoot, clientId, { isHub: true });
            return startServer({
                port,
                version: "0.0.0-test",
                hubId: crypto.randomUUID(),
                registry,
            });
        },
        findFreePort: async (preferred) => preferred ?? 0,
        log: () => {},
        timings: TEST_TIMINGS,
        discoveryPorts: [],
    });
}

async function reposOn(port: number): Promise<HubReposResponse> {
    const res = await fetch(`http://127.0.0.1:${port}/api/hub/repos`);
    if (!res.ok) throw new Error(`repos fetch failed: ${res.status}`);
    return (await res.json()) as HubReposResponse;
}

async function waitFor<T>(
    fn: () => Promise<T | null | false>,
    timeoutMs: number,
    stepMs = 50,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await fn();
        if (value) return value;
        if (Date.now() > deadline) throw new Error("waitFor timed out");
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
}

describe("probe and discovery", () => {
    let repoRoot: string;
    let hub: StartedServer;
    const cleanup: string[] = [];

    beforeAll(async () => {
        repoRoot = await makeGitRepo();
        cleanup.push(repoRoot);
        hub = await makeHub(repoRoot, 0, "probe-hub");
    });

    afterAll(async () => {
        await hub.close();
        await Promise.all(cleanup.map((dir) => rm(dir, { recursive: true, force: true })));
    });

    test("probeHub finds a prettydiff hub", async () => {
        const identity = await probeHub(hub.port, 250);
        expect(identity?.app).toBe("prettydiff");
        expect(identity?.hubId).toBe("probe-hub");
    });

    test("probeHub rejects a non-prettydiff server", async () => {
        const decoy = Bun.serve({
            port: 0,
            fetch: () => Response.json({ hello: "world" }),
        });
        try {
            expect(await probeHub(decoy.port ?? 0, 250)).toBeNull();
        } finally {
            await decoy.stop(true);
        }
    });

    test("probeHub returns null for a closed port", async () => {
        const decoy = Bun.serve({ port: 0, fetch: () => new Response("x") });
        const closedPort = decoy.port ?? 0;
        await decoy.stop(true);
        expect(await probeHub(closedPort, 250)).toBeNull();
    });

    test("discoverHub honors preferredPort", async () => {
        const found = await discoverHub({ preferredPort: hub.port, probeTimeoutMs: 250 });
        expect(found?.port).toBe(hub.port);
    });

    test("discoverHub returns the first responding port in scan order", async () => {
        const second = await makeHub(repoRoot, 0, "probe-hub-2");
        try {
            const ports = [hub.port, second.port].sort((a, b) => a - b);
            const found = await discoverHub({ ports, probeTimeoutMs: 250 });
            expect(found?.port).toBe(ports[0]);
        } finally {
            await second.close();
        }
    });
});

describe("attach, heartbeat, takeover", () => {
    const cleanup: string[] = [];

    afterAll(async () => {
        await Promise.all(cleanup.map((dir) => rm(dir, { recursive: true, force: true })));
    });

    test("attaches to a running hub and unregisters on stop", async () => {
        const hubRoot = await makeGitRepo();
        const clientRoot = await makeGitRepo();
        cleanup.push(hubRoot, clientRoot);
        const hub = await makeHub(hubRoot);
        try {
            const controller = await startTestInstance(clientRoot, hub.port);
            expect(controller.mode).toBe("attached");
            expect(controller.url).toBe(
                `http://127.0.0.1:${hub.port}/?repo=${repoIdFor(clientRoot)}`,
            );
            expect((await reposOn(hub.port)).repos).toHaveLength(2);

            await controller.stop();
            expect((await reposOn(hub.port)).repos).toHaveLength(1);
        } finally {
            await hub.close();
        }
    });

    test("re-registers after the hub forgets it (heartbeat 404)", async () => {
        const hubRoot = await makeGitRepo();
        const clientRoot = await makeGitRepo();
        cleanup.push(hubRoot, clientRoot);
        const registry = new HubRegistry();
        registry.register(hubRoot, "hub-client", { isHub: true });
        const hub = await startServer({
            port: 0,
            version: "0.0.0-test",
            hubId: "forgetful-hub",
            registry,
        });
        try {
            const clientId = crypto.randomUUID();
            const controller = await startTestInstance(clientRoot, hub.port, clientId);
            const repoId = repoIdFor(clientRoot);
            expect((await reposOn(hub.port)).repos.some((r) => r.id === repoId)).toBe(true);

            // Simulate a prune (e.g. after laptop sleep): the next heartbeat gets
            // a 404 and the client must re-register on its own.
            registry.unregister(repoId, clientId);
            expect((await reposOn(hub.port)).repos.some((r) => r.id === repoId)).toBe(false);
            await waitFor(
                async () => (await reposOn(hub.port)).repos.some((r) => r.id === repoId),
                3000,
            );
            await controller.stop();
        } finally {
            await hub.close();
        }
    });

    test("takes over the hub port when the hub dies", async () => {
        const hubRoot = await makeGitRepo();
        const clientRoot = await makeGitRepo();
        cleanup.push(hubRoot, clientRoot);
        const hub = await makeHub(hubRoot, 0, "dying-hub");
        const hubPort = hub.port;
        const controller = await startTestInstance(clientRoot, hubPort);
        expect(controller.mode).toBe("attached");

        await hub.close();
        const identity = await waitFor(async () => {
            const found = await probeHub(hubPort, 250);
            return found && found.hubId !== "dying-hub" ? found : null;
        }, 5000);
        expect(identity.app).toBe("prettydiff");
        expect(controller.mode).toBe("hub");
        const repos = await reposOn(hubPort);
        expect(repos.repos).toHaveLength(1);
        expect(repos.repos[0].id).toBe(repoIdFor(clientRoot));
        await controller.stop();
    });

    test("N-way race: exactly one attachee wins, the rest re-attach", async () => {
        const hubRoot = await makeGitRepo();
        const clientRoots = [await makeGitRepo(), await makeGitRepo(), await makeGitRepo()];
        cleanup.push(hubRoot, ...clientRoots);
        const hub = await makeHub(hubRoot, 0, "racing-hub");
        const hubPort = hub.port;
        const controllers = await Promise.all(
            clientRoots.map((root) => startTestInstance(root, hubPort)),
        );
        expect(controllers.every((c) => c.mode === "attached")).toBe(true);

        await hub.close();
        await waitFor(async () => {
            const found = await probeHub(hubPort, 250);
            return found && found.hubId !== "racing-hub" ? found : null;
        }, 5000);
        // All three survivors converge onto the new hub.
        await waitFor(async () => (await reposOn(hubPort)).repos.length === 3, 5000);

        const hubs = controllers.filter((c) => c.mode === "hub");
        const attached = controllers.filter((c) => c.mode === "attached");
        expect(hubs).toHaveLength(1);
        expect(attached).toHaveLength(2);

        for (const controller of controllers) await controller.stop();
    });
});
