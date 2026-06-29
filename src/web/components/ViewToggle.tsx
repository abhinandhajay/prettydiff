import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Rows3 as Rows, Columns3 as Columns } from "lucide-react";

export type ViewMode = "unified" | "split";

interface Props {
    value: ViewMode;
    onChange: (v: ViewMode) => void;
}

const itemClass =
    "inline-flex h-7 items-center justify-center gap-1 rounded-[5px] border-0 bg-transparent px-2.5 " +
    "text-[11.5px] font-medium tracking-tight text-muted-foreground transition-colors " +
    "hover:bg-card/60 hover:text-foreground " +
    "data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm";

export function ViewToggle({ value, onChange }: Props) {
    return (
        <ToggleGroup
            type="single"
            value={value}
            onValueChange={(v) => v && onChange(v as ViewMode)}
            className="bg-muted/60 inline-flex h-8 items-center gap-0.5 rounded-md p-0.5"
        >
            <ToggleGroupItem value="unified" aria-label="Unified view" className={itemClass}>
                <Rows className="size-3.5" />
                <span className="hidden sm:inline">Unified</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="split" aria-label="Side-by-side view" className={itemClass}>
                <Columns className="size-3.5" />
                <span className="hidden sm:inline">Split</span>
            </ToggleGroupItem>
        </ToggleGroup>
    );
}
