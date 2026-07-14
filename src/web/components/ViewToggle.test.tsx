import { describe, expect, test } from "bun:test";

import { ViewToggle } from "@/components/ViewToggle";
import { fireEvent, render, screen } from "@testing-library/react";

describe("ViewToggle", () => {
    test("marks the active mode", () => {
        render(<ViewToggle value="unified" onChange={() => {}} />);
        expect(screen.getByLabelText("Unified view")).toHaveAttribute("data-state", "on");
        expect(screen.getByLabelText("Side-by-side view")).toHaveAttribute("data-state", "off");
    });

    test("clicking the inactive mode emits it", () => {
        const changes: string[] = [];
        render(<ViewToggle value="unified" onChange={(v) => changes.push(v)} />);
        fireEvent.click(screen.getByLabelText("Side-by-side view"));
        expect(changes).toEqual(["split"]);
    });

    test("clicking the active mode does not emit a deselect", () => {
        const changes: string[] = [];
        render(<ViewToggle value="unified" onChange={(v) => changes.push(v)} />);
        fireEvent.click(screen.getByLabelText("Unified view"));
        expect(changes).toEqual([]);
    });
});
