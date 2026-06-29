import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface Props {
    kind: "loading" | "error" | "empty";
    title: string;
    message?: string;
}

export function EmptyState({ kind, title, message }: Props) {
    return (
        <div className="bg-background relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-6 text-center">
            {kind === "loading" && (
                <div className="text-primary bg-card border-border inline-flex size-11 items-center justify-center rounded-sm border">
                    <Loader2 className="size-5 animate-spin" />
                </div>
            )}
            {kind === "error" && (
                <div className="inline-flex size-11 items-center justify-center rounded-sm border border-rose-500/25 bg-rose-500/10 text-rose-400">
                    <AlertTriangle className="size-5" />
                </div>
            )}
            {kind === "empty" && (
                <div className="inline-flex size-11 items-center justify-center rounded-sm border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
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
