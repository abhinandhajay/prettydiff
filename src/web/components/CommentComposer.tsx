import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef, useState } from "react";

interface Props {
    onSave: (body: string) => void;
    onCancel: () => void;
}

export function CommentComposer({ onSave, onCancel }: Props) {
    const [value, setValue] = useState("");
    const ref = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    const trimmed = value.trim();
    const canSave = trimmed.length > 0;

    return (
        <div className="bg-card border-primary/25 mx-2 my-2 overflow-hidden rounded-sm border">
            <div className="bg-muted/35 border-primary/20 flex items-center justify-between gap-2 border-b px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                    <span className="bg-muted-foreground/80 size-1.5 rounded-full" aria-hidden />
                    <span className="text-foreground/85 text-[11px] font-medium tracking-[0.14em] uppercase">
                        New comment
                    </span>
                </div>
                <span className="text-muted-foreground/70 hidden font-mono text-[10.5px] sm:inline">
                    ⌘/Ctrl ↵ to save · Esc to cancel
                </span>
            </div>
            <div className="px-3 pt-2.5 pb-3">
                <Textarea
                    ref={ref}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            e.preventDefault();
                            onCancel();
                        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSave) {
                            e.preventDefault();
                            onSave(trimmed);
                        }
                    }}
                    placeholder="Note something for your AI agent to pick up…"
                    rows={3}
                    className="bg-background min-h-20 resize-y text-[13px] leading-relaxed"
                />
                <div className="mt-2.5 flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button size="sm" disabled={!canSave} onClick={() => onSave(trimmed)}>
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
}
