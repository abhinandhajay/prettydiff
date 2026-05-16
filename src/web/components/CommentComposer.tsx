import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquarePlus } from "lucide-react";
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
        <div className="bg-card border-border/70 ring-primary/15 mx-3 my-2 overflow-hidden rounded-lg border shadow-md ring-1">
            <div className="bg-primary/8 border-border/60 flex items-center justify-between gap-2 border-b px-3 py-1.5">
                <div className="text-foreground/85 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
                    <MessageSquarePlus className="text-primary size-3.5" />
                    New comment
                </div>
                <span className="text-muted-foreground/80 hidden font-mono text-[10.5px] sm:inline">
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
                    placeholder="Leave a comment for your AI agent…"
                    rows={3}
                    className="bg-background/60 min-h-20 resize-y text-[13px] leading-relaxed"
                />
                <div className="mt-2.5 flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button size="sm" disabled={!canSave} onClick={() => onSave(trimmed)}>
                        Save comment
                    </Button>
                </div>
            </div>
        </div>
    );
}
