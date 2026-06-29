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
        <div className="bg-primary/[0.04] border-border/55 relative border-b py-2.5 pr-3 pl-4">
            <span aria-hidden className="bg-primary/70 absolute inset-y-0 left-0 w-[2px]" />
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-[10px] font-medium tracking-[0.13em] uppercase">
                    New comment
                </span>
                <span className="text-muted-foreground/70 hidden font-mono text-[10px] sm:inline">
                    ⌘/Ctrl ↵ save · Esc cancel
                </span>
            </div>
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
            <div className="mt-2 flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onCancel}>
                    Cancel
                </Button>
                <Button size="sm" disabled={!canSave} onClick={() => onSave(trimmed)}>
                    Save
                </Button>
            </div>
        </div>
    );
}
