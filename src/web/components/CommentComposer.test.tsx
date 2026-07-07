import { describe, expect, test } from "bun:test";

import { CommentComposer } from "@/components/CommentComposer";
import { fireEvent, render, screen } from "@testing-library/react";

function setup() {
    const saved: string[] = [];
    let cancels = 0;
    render(<CommentComposer onSave={(body) => saved.push(body)} onCancel={() => (cancels += 1)} />);
    const textarea = screen.getByRole("textbox");
    return { saved, cancels: () => cancels, textarea };
}

describe("CommentComposer", () => {
    test("focuses the textarea on mount", () => {
        const { textarea } = setup();
        expect(document.activeElement).toBe(textarea);
    });

    test("disables Save for empty and whitespace-only input", () => {
        const { textarea } = setup();
        const save = screen.getByRole("button", { name: "Save" });
        expect(save).toBeDisabled();
        fireEvent.change(textarea, { target: { value: "   " } });
        expect(save).toBeDisabled();
        fireEvent.change(textarea, { target: { value: "note" } });
        expect(save).toBeEnabled();
    });

    test("saves the trimmed body on click", () => {
        const { saved, textarea } = setup();
        fireEvent.change(textarea, { target: { value: "  a note  " } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(saved).toEqual(["a note"]);
    });

    test.each([{ metaKey: true }, { ctrlKey: true }])("saves on Enter with %o", (modifier) => {
        const { saved, textarea } = setup();
        fireEvent.change(textarea, { target: { value: "note" } });
        fireEvent.keyDown(textarea, { key: "Enter", ...modifier });
        expect(saved).toEqual(["note"]);
    });

    test("plain Enter does not save", () => {
        const { saved, textarea } = setup();
        fireEvent.change(textarea, { target: { value: "note" } });
        fireEvent.keyDown(textarea, { key: "Enter" });
        expect(saved).toEqual([]);
    });

    test("modified Enter with empty input does nothing", () => {
        const { saved, textarea } = setup();
        fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
        expect(saved).toEqual([]);
    });

    test("Escape and the Cancel button both cancel", () => {
        const { cancels, textarea } = setup();
        fireEvent.keyDown(textarea, { key: "Escape" });
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(cancels()).toBe(2);
    });
});
