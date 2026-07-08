import type { StartedServer } from "./server.js";
import type { HubIdentity, RegisterResponse } from "./types.js";

export const PORT_START = 39400;
export const PORT_END = 39499;

export interface HubTimings {
    probeTimeoutMs: number;
    heartbeatIntervalMs: number;
    heartbeatTimeoutMs: number;
    heartbeatRetryDelayMs: number;
    takeoverJitterMaxMs: number;
    takeoverRounds: number;
    rejoinProbeAttempts: number;
    rejoinProbeDelayMs: number;
}

export const DEFAULT_TIMINGS: HubTimings = {
    probeTimeoutMs: 300,
    heartbeatIntervalMs: 5000,
    heartbeatTimeoutMs: 2000,
    heartbeatRetryDelayMs: 1000,
    takeoverJitterMaxMs: 250,
    takeoverRounds: 3,
    rejoinProbeAttempts: 10,
    rejoinProbeDelayMs: 200,
};

export type HeartbeatResult = "ok" | "unknown" | "refused" | "timeout";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConnectionRefused(err: unknown): boolean {
    const e = err as { code?: string; cause?: { code?: string } };
    const code = e?.code ?? e?.cause?.code;
    return code === "ECONNREFUSED" || code === "ConnectionRefused";
}

function isAddrInUse(err: unknown): boolean {
    return (err as { code?: string })?.code === "EADDRINUSE";
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function hubUrl(port: number, pathname: string): string {
    return `http://127.0.0.1:${port}${pathname}`;
}

export async function probeHub(port: number, timeoutMs: number): Promise<HubIdentity | null> {
    try {
        const res = await fetchWithTimeout(hubUrl(port, "/api/hub"), {}, timeoutMs);
        if (!res.ok) return null;
        const body = (await res.json()) as HubIdentity;
        return body?.app === "prettydiff" ? body : null;
    } catch {
        return null;
    }
}

export async function discoverHub(options: {
    preferredPort?: number;
    probeTimeoutMs?: number;
    ports?: number[];
}): Promise<{ port: number; identity: HubIdentity } | null> {
    const timeoutMs = options.probeTimeoutMs ?? DEFAULT_TIMINGS.probeTimeoutMs;
    if (options.preferredPort) {
        const identity = await probeHub(options.preferredPort, timeoutMs);
        return identity ? { port: options.preferredPort, identity } : null;
    }
    const ports =
        options.ports ??
        Array.from({ length: PORT_END - PORT_START + 1 }, (_, i) => PORT_START + i);
    const results = await Promise.all(
        ports.map(async (port) => ({ port, identity: await probeHub(port, timeoutMs) })),
    );
    for (const result of results) {
        if (result.identity) return { port: result.port, identity: result.identity };
    }
    return null;
}

export async function registerWithHub(
    port: number,
    repoRoot: string,
    clientId: string,
    timeoutMs: number,
): Promise<RegisterResponse | null> {
    try {
        const res = await fetchWithTimeout(
            hubUrl(port, "/api/hub/register"),
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ repoRoot, clientId }),
            },
            timeoutMs,
        );
        if (!res.ok) return null;
        return (await res.json()) as RegisterResponse;
    } catch {
        return null;
    }
}

export async function sendHeartbeat(
    port: number,
    repoId: string,
    clientId: string,
    timeoutMs: number,
): Promise<HeartbeatResult> {
    try {
        const res = await fetchWithTimeout(
            hubUrl(port, "/api/hub/heartbeat"),
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ repoId, clientId }),
            },
            timeoutMs,
        );
        if (res.ok) return "ok";
        if (res.status === 404) return "unknown";
        return "timeout";
    } catch (err) {
        return isConnectionRefused(err) ? "refused" : "timeout";
    }
}

export async function unregisterFromHub(
    port: number,
    repoId: string,
    clientId: string,
    timeoutMs: number,
): Promise<void> {
    try {
        await fetchWithTimeout(
            hubUrl(port, "/api/hub/unregister"),
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ repoId, clientId }),
            },
            timeoutMs,
        );
    } catch {
        // best-effort — the hub prunes stale clients anyway
    }
}

export interface InstanceOptions {
    repoRoot: string;
    clientId: string;
    version: string;
    preferredPort?: number;
    standalone?: boolean;
    startHubServer: (port: number) => Promise<StartedServer>;
    findFreePort: (preferred?: number) => Promise<number>;
    log: (message: string) => void;
    timings?: Partial<HubTimings>;
    // Test hook: restrict full-range discovery scans to these ports.
    discoveryPorts?: number[];
}

export interface InstanceController {
    readonly mode: "hub" | "attached";
    readonly url: string;
    stop(): Promise<void>;
}

export async function startInstance(options: InstanceOptions): Promise<InstanceController> {
    const t: HubTimings = { ...DEFAULT_TIMINGS, ...options.timings };
    const state = {
        mode: "hub" as "hub" | "attached",
        server: null as StartedServer | null,
        hubPort: 0,
        repoId: "",
        stopped: false,
        heartbeatTimer: null as ReturnType<typeof setTimeout> | null,
    };

    async function becomeHub(port: number): Promise<void> {
        const server = await options.startHubServer(port);
        if (state.stopped) {
            await server.close();
            return;
        }
        state.server = server;
        state.mode = "hub";
        state.hubPort = server.port;
    }

    async function tryAttach(port: number): Promise<boolean> {
        const res = await registerWithHub(
            port,
            options.repoRoot,
            options.clientId,
            t.heartbeatTimeoutMs,
        );
        if (!res) return false;
        state.mode = "attached";
        state.hubPort = port;
        state.repoId = res.repo.id;
        scheduleHeartbeat();
        return true;
    }

    // The heartbeat chain is deliberately not unref'd: in attached mode it is the
    // handle that keeps the process alive.
    function scheduleHeartbeat(delayMs: number = t.heartbeatIntervalMs): void {
        if (state.stopped) return;
        state.heartbeatTimer = setTimeout(() => {
            runHeartbeat().catch((err: Error) => {
                options.log(`prettydiff: error — ${err.message}`);
                if (!state.stopped && state.mode === "attached") scheduleHeartbeat();
            });
        }, delayMs);
    }

    async function runHeartbeat(): Promise<void> {
        if (state.stopped || state.mode !== "attached") return;
        let result = await sendHeartbeat(
            state.hubPort,
            state.repoId,
            options.clientId,
            t.heartbeatTimeoutMs,
        );
        if (state.stopped) return;
        if (result === "unknown") {
            // Pruned after a sleep, or a new hub took the port: re-register.
            if (await tryAttach(state.hubPort)) return;
            result = "refused";
        }
        if (result === "ok") {
            scheduleHeartbeat();
            return;
        }
        if (result === "timeout") {
            await sleep(t.heartbeatRetryDelayMs);
            if (state.stopped) return;
            const retry = await sendHeartbeat(
                state.hubPort,
                state.repoId,
                options.clientId,
                t.heartbeatTimeoutMs,
            );
            if (state.stopped) return;
            if (retry === "ok") {
                scheduleHeartbeat();
                return;
            }
            if (retry === "unknown" && (await tryAttach(state.hubPort))) return;
        }
        await runTakeover();
    }

    async function runTakeover(): Promise<void> {
        const oldPort = state.hubPort;
        for (let round = 0; round < t.takeoverRounds; round++) {
            if (state.stopped) return;
            await sleep(Math.random() * t.takeoverJitterMaxMs);
            try {
                await becomeHub(oldPort);
                options.log(
                    `prettydiff: server exited — took over, serving on ${state.server?.url}`,
                );
                return;
            } catch (err) {
                if (!isAddrInUse(err)) throw err;
            }
            // Someone else holds the port — wait for the winner to answer.
            for (let attempt = 0; attempt < t.rejoinProbeAttempts; attempt++) {
                if (state.stopped) return;
                const identity = await probeHub(oldPort, t.probeTimeoutMs);
                if (identity) {
                    if (await tryAttach(oldPort)) {
                        options.log(
                            `prettydiff: server exited — reattached to the new one on port ${oldPort}`,
                        );
                        return;
                    }
                    break;
                }
                await sleep(t.rejoinProbeDelayMs);
            }
        }
        if (state.stopped) return;
        const found = await discoverHub({
            probeTimeoutMs: t.probeTimeoutMs,
            ports: options.discoveryPorts,
        });
        if (found && (await tryAttach(found.port))) {
            options.log(
                `prettydiff: server exited — reattached to the new one on port ${found.port}`,
            );
            return;
        }
        if (state.stopped) return;
        await becomeHub(await options.findFreePort());
        options.log(
            `prettydiff: server exited — took over on a new port, serving on ${state.server?.url}`,
        );
    }

    const controller: InstanceController = {
        get mode() {
            return state.mode;
        },
        get url() {
            return state.mode === "hub"
                ? (state.server?.url ?? hubUrl(state.hubPort, ""))
                : hubUrl(state.hubPort, `/?repo=${state.repoId}`);
        },
        stop: async () => {
            state.stopped = true;
            if (state.heartbeatTimer) clearTimeout(state.heartbeatTimer);
            if (state.mode === "hub") {
                await state.server?.close();
            } else {
                await unregisterFromHub(state.hubPort, state.repoId, options.clientId, 1000);
            }
        },
    };

    if (options.standalone) {
        await becomeHub(await options.findFreePort(options.preferredPort));
        return controller;
    }

    const found = await discoverHub({
        preferredPort: options.preferredPort,
        probeTimeoutMs: t.probeTimeoutMs,
    });
    if (found) {
        if (found.identity.version !== options.version) {
            options.log(
                `prettydiff: note — attaching to a server running v${found.identity.version} (this is v${options.version})`,
            );
        }
        if (await tryAttach(found.port)) return controller;
        // Hub was mid-shutdown: look again before claiming a port ourselves.
        const again = await discoverHub({
            probeTimeoutMs: t.probeTimeoutMs,
            ports: options.discoveryPorts,
        });
        if (again && (await tryAttach(again.port))) return controller;
    }

    try {
        await becomeHub(await options.findFreePort(options.preferredPort));
    } catch (err) {
        if (!isAddrInUse(err)) throw err;
        // Lost a startup race — whoever bound the port is the hub now.
        const winner = await discoverHub({
            probeTimeoutMs: t.probeTimeoutMs,
            ports: options.discoveryPorts,
        });
        if (!winner || !(await tryAttach(winner.port))) throw err;
    }
    return controller;
}
