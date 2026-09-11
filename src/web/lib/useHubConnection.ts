import { useEffect, useRef, useState } from "react";

import type { HubIdentity } from "./types";

export type HubConnectionStatus = "connected" | "reconnecting" | "reconnected";

const CONNECTED_POLL_MS = 5000;
const RECONNECTING_POLL_MS = 1000;
const RECONNECTED_BADGE_MS = 3000;

// Polls the hub identity endpoint so the viewer notices a dead server and,
// after a takeover, the new hub (a changed hubId) without a manual reload.
export function useHubConnection(
    initialHubId: string | null,
    onHubChanged: () => void,
): HubConnectionStatus {
    const [status, setStatus] = useState<HubConnectionStatus>("connected");
    const onHubChangedRef = useRef(onHubChanged);
    useEffect(() => {
        onHubChangedRef.current = onHubChanged;
    });

    useEffect(() => {
        if (status !== "reconnected") return;
        const badgeTimer = window.setTimeout(() => {
            setStatus("connected");
        }, RECONNECTED_BADGE_MS);
        return () => window.clearTimeout(badgeTimer);
    }, [status]);

    useEffect(() => {
        if (initialHubId === null) return;
        let disposed = false;
        let pollTimer: number | undefined;
        let hubId = initialHubId;
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
                const changed = identity.hubId !== hubId;
                hubId = identity.hubId;
                if (failing) {
                    failing = false;
                    setStatus("reconnected");
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
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [initialHubId]);

    return status;
}
