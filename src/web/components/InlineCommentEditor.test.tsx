import { describe, expect, test } from "bun:test";

import { InlineCommentEditor } from "@/components/InlineCommentEditor";
import { fireEvent, render, screen } from "@testing-library/react";

function setup(initialValue = "existing note") {
    const saved: string[] = [];
    let cancels = 0;
    render(
        <InlineCommentEditor
            initialValue={initialValue}
            onSave={(body) => saved.push(body)}
            onCancel={() => (cancels += 1)}
        />,
    );
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    return { saved, cancels: () => cancels, textarea };
}

describe("InlineCommentEditor", () => {
    test("renders the initial value with the cursor at the end", () => {
        const { textarea } = setup();
        expect(textarea.value).toBe("existing note");
        expect(document.activeElement).toBe(textarea);
        expect(textarea.selectionStart).toBe("existing note".length);
    });

    test("saves the trimmed draft via the save button", () => {
        const { saved, textarea } = setup();
        fireEvent.change(textarea, { target: { value: "  updated  " } });
        fireEvent.click(screen.getByTitle("Save (⌘/Ctrl ↵)"));
        expect(saved).toEqual(["updated"]);
    });

    test("disables save when the draft is emptied", () => {
        const { textarea } = setup();
        fireEvent.change(textarea, { target: { value: "   " } });
        expect(screen.getByTitle("Save (⌘/Ctrl ↵)")).toBeDisabled();
    });

    test("saves on Ctrl+Enter", () => {
        const { saved, textarea } = setup();
        fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
        expect(saved).toEqual(["existing note"]);
    });

    test("Escape cancels without saving", () => {
        const { saved, cancels, textarea } = setup();
        fireEvent.keyDown(textarea, { key: "Escape" });
        expect(cancels()).toBe(1);
        expect(saved).toEqual([]);
    });
});
