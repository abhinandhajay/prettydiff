import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
    initialValue: string;
    onSave: (body: string) => void;
    onCancel: () => void;
    rows?: number;
    minHeightClass?: string;
}

export function InlineCommentEditor({
    initialValue,
    onSave,
    onCancel,
    rows = 3,
    minHeightClass = "min-h-14",
}: Props) {
    const [draft, setDraft] = useState(initialValue);
    const ref = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        ref.current?.focus();
        const len = ref.current?.value.length ?? 0;
        ref.current?.setSelectionRange(len, len);
    }, []);

    const trimmed = draft.trim();
    const canSave = trimmed.length > 0;

    return (
        <div>
            <Textarea
                ref={ref}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={rows}
                className={`bg-background ${minHeightClass} resize-y text-[12.5px] leading-relaxed`}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        onCancel();
                    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSave) {
                        e.preventDefault();
                        onSave(trimmed);
                    }
                }}
            />
            <div className="mt-1.5 flex items-center justify-end gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={onCancel}
                    title="Cancel (Esc)"
                >
                    <X className="size-3" />
                </Button>
                <Button
                    size="icon"
                    className="size-6"
                    disabled={!canSave}
                    onClick={() => onSave(trimmed)}
                    title="Save (⌘/Ctrl ↵)"
                >
                    <Check className="size-3" />
                </Button>
            </div>
        </div>
    );
}
