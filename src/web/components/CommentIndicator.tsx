import { Badge } from "@/components/ui/badge";
import { MessageSquareText } from "lucide-react";

interface Props {
    count: number;
    preview: string;
    onClick: () => void;
}

export function CommentIndicator({ count, preview, onClick }: Props) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="bg-primary/5 hover:bg-primary/10 border-primary/20 my-0.5 flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left transition-colors"
            title="Show in comments sidebar"
        >
            <MessageSquareText className="text-primary size-3.5 shrink-0" />
            <span className="text-foreground/85 truncate text-[12px]">{preview}</span>
            {count > 1 ? (
                <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                    {count}
                </Badge>
            ) : null}
        </button>
    );
}
