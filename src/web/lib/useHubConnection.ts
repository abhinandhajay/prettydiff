import { useEffect, useRef, useState } from "react";

import type { HubIdentity } from "./types";

export type HubConnectionStatus = "connected" | "reconnecting" | "reconnected";

const CONNECTED_POLL_MS = 5000;
const RECONNECTING_POLL_MS = 1000;
const RECONNECTED_BADGE_MS = 3000;

// Polls the hub identity endpoint so the viewer notices a dead server and,
// after a takeover, the new hub (a changed hubId) without a manual reload.
export function useHubConnection(enabled: boolean, onHubChanged: () => void): HubConnectionStatus {
    const [status, setStatus] = useState<HubConnectionStatus>("connected");
    const onHubChangedRef = useRef(onHubChanged);
    useEffect(() => {
        onHubChangedRef.current = onHubChanged;
    });

    useEffect(() => {
        if (!enabled) return;
        let disposed = false;
        let pollTimer: number | undefined;
        let badgeTimer: number | undefined;
        let hubId: string | null = null;
        let failing = false;

        const schedule = (delayMs: number) => {
            if (disposed) return;
            pollTimer = window.setTimeout(poll, delayMs);
        };

        const poll = async () => {
            if (disposed) return;
            // The chain stops while hidden; the visibilitychange listener restarts it.
            if (document.visibilityState === "hidden") return;
            try {
                const res = await fetch("/api/hub");
                if (!res.ok) throw new Error(String(res.status));
                const identity = (await res.json()) as HubIdentity;
                if (disposed) return;
                const changed = hubId !== null && identity.hubId !== hubId;
                hubId = identity.hubId;
                if (failing) {
                    failing = false;
                    setStatus("reconnected");
                    window.clearTimeout(badgeTimer);
                    badgeTimer = window.setTimeout(() => {
                        setStatus((s) => (s === "reconnected" ? "connected" : s));
                    }, RECONNECTED_BADGE_MS);
                }
                if (changed) onHubChangedRef.current();
                schedule(CONNECTED_POLL_MS);
            } catch {
                if (disposed) return;
                failing = true;
                setStatus("reconnecting");
                schedule(RECONNECTING_POLL_MS);
            }
        };

        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                window.clearTimeout(pollTimer);
                void poll();
            }
        };
        document.addEventListener("visibilitychange", onVisibility);
        schedule(CONNECTED_POLL_MS);
        return () => {
            disposed = true;
            window.clearTimeout(pollTimer);
            window.clearTimeout(badgeTimer);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [enabled]);

    return status;
}
