import { Check, RefreshCw } from "lucide-react";

import type { HubConnectionStatus } from "@/lib/useHubConnection";

export function ConnectionBanner({
    status,
    note,
}: {
    status: HubConnectionStatus;
    note?: string | null;
}) {
    if (status === "connected") return null;
    return (
        <div className="pointer-events-none fixed inset-x-0 top-12 z-40 flex justify-center px-3">
            <div className="bg-background border-border pointer-events-auto mt-2 flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] shadow-md">
                {status === "reconnecting" ? (
                    <>
                        <RefreshCw className="text-muted-foreground size-3.5 shrink-0 animate-spin" />
                        <span className="text-muted-foreground">
                            Server connection lost — waiting for another prettydiff instance to take
                            over…
                        </span>
                    </>
                ) : (
                    <>
                        <Check className="size-3.5 shrink-0 text-green-600 dark:text-green-500" />
                        <span className="text-foreground">
                            Reconnected{note ? ` — ${note}` : ""}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}
