import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Rows3 as Rows, Columns3 as Columns } from "lucide-react";

export type ViewMode = "unified" | "split";

interface Props {
    value: ViewMode;
    onChange: (v: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: Props) {
    return (
        <ToggleGroup
            type="single"
            value={value}
            onValueChange={(v) => v && onChange(v as ViewMode)}
            variant="outline"
            size="sm"
        >
            <ToggleGroupItem value="unified" aria-label="Unified view">
                <Rows />
                <span className="ml-1.5 text-xs">Unified</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="split" aria-label="Side-by-side view">
                <Columns />
                <span className="ml-1.5 text-xs">Split</span>
            </ToggleGroupItem>
        </ToggleGroup>
    );
}
