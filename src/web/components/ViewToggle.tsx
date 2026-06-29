import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Rows3 as Rows, Columns3 as Columns } from "lucide-react";

export type ViewMode = "unified" | "split";

interface Props {
    value: ViewMode;
    onChange: (v: ViewMode) => void;
}

const itemClass =
    "h-8 rounded-none border-0 px-2.5 text-[11.5px] font-medium tracking-tight " +
    "text-muted-foreground hover:text-foreground hover:bg-muted/55 " +
    "data-[state=on]:bg-muted data-[state=on]:text-foreground " +
    "data-[state=on]:shadow-[inset_0_-1px_0_var(--primary)] " +
    "transition-colors first:rounded-l-sm last:rounded-r-sm";

export function ViewToggle({ value, onChange }: Props) {
    return (
        <ToggleGroup
            type="single"
            value={value}
            onValueChange={(v) => v && onChange(v as ViewMode)}
            variant="outline"
            size="sm"
            className="border-border bg-card gap-0 overflow-hidden rounded-sm border"
        >
            <ToggleGroupItem value="unified" aria-label="Unified view" className={itemClass}>
                <Rows className="size-3.5" />
                <span className="ml-1 hidden sm:inline">Unified</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="split" aria-label="Side-by-side view" className={itemClass}>
                <Columns className="size-3.5" />
                <span className="ml-1 hidden sm:inline">Split</span>
            </ToggleGroupItem>
        </ToggleGroup>
    );
}
