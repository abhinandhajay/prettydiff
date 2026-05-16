import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface Props {
    kind: "loading" | "error" | "empty";
    title: string;
    message?: string;
}

export function EmptyState({ kind, title, message }: Props) {
    return (
        <div className="bg-background relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-6 text-center">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(oklch(1_0_0/0.05)_1px,transparent_1px)] bg-size-[18px_18px] opacity-60" />

            {kind === "loading" && (
                <div className="text-primary bg-primary/10 ring-primary/25 inline-flex size-12 items-center justify-center rounded-full ring-1">
                    <Loader2 className="size-5 animate-spin" />
                </div>
            )}
            {kind === "error" && (
                <div className="inline-flex size-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/30">
                    <AlertTriangle className="size-5" />
                </div>
            )}
            {kind === "empty" && (
                <div className="inline-flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
                    <CheckCircle2 className="size-5" />
                </div>
            )}

            <div className="flex flex-col items-center gap-1.5">
                <div className="text-foreground text-[17px] font-semibold tracking-tight">
                    {title.replace(/…$/, "")}
                    {kind === "loading" ? (
                        <span className="text-primary ml-0.5 inline-block animate-pulse">…</span>
                    ) : null}
                </div>
                {message ? (
                    <div className="text-muted-foreground max-w-md font-mono text-[12.5px] leading-relaxed">
                        {message}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
