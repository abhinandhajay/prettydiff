import { describe, expect, test } from "bun:test";

import { CommentsPanelContent } from "@/components/CommentsSidebar";
import { fireEvent, render, screen } from "@testing-library/react";

import type { CommentMap, DiffComment } from "@/lib/types";

function makeComment(overrides: Partial<DiffComment>): DiffComment {
    return {
        id: "id",
        filePath: "a.ts",
        side: "additions",
        lineNumber: 1,
        lineType: "change-addition",
        lineText: "line text",
        body: "a comment",
        createdAt: Date.now(),
        ...overrides,
    };
}

const comments: CommentMap = {
    "b.ts": [
        makeComment({ id: "b1", filePath: "b.ts", lineNumber: 5, body: "b five" }),
        makeComment({ id: "b2", filePath: "b.ts", lineNumber: 1, body: "b one" }),
    ],
    "a.ts": [
        makeComment({ id: "a1", lineNumber: 2, body: "a two" }),
        makeComment({ id: "a2", lineNumber: 3, body: "a three", stale: true }),
    ],
};

interface Handlers {
    toggled: string[];
    fileToggles: Array<[string, boolean]>;
    edits: Array<[string, string]>;
    deletes: string[];
    copies: number;
    jumps: string[];
}

function setup(overrides: {
    comments?: CommentMap;
    totalCount?: number;
    selectedIds?: Set<string>;
}): Handlers {
    const handlers: Handlers = {
        toggled: [],
        fileToggles: [],
        edits: [],
        deletes: [],
        copies: 0,
        jumps: [],
    };
    render(
        <CommentsPanelContent
            comments={overrides.comments ?? comments}
            totalCount={overrides.totalCount ?? 4}
            selectedIds={overrides.selectedIds ?? new Set()}
            onToggleSelected={(id) => handlers.toggled.push(id)}
            onToggleFile={(path, select) => handlers.fileToggles.push([path, select])}
            onEdit={(id, body) => handlers.edits.push([id, body])}
            onDelete={(id) => handlers.deletes.push(id)}
            onCopy={() => (handlers.copies += 1)}
            scrollToId={null}
            onScrollHandled={() => {}}
            onJumpToDiff={(id) => handlers.jumps.push(id)}
        />,
    );
    return handlers;
}

describe("CommentsPanelContent", () => {
    test("shows the empty state when there are no comments", () => {
        setup({ comments: {}, totalCount: 0 });
        expect(screen.getByText("Hover a line, tap +, leave a note.")).toBeInTheDocument();
        expect(screen.queryByText("a.ts")).not.toBeInTheDocument();
    });

    test("groups by file sorted by path, comments sorted by line", () => {
        setup({});
        const labels = screen.getAllByText(/^L\d+$/).map((el) => el.textContent);
        expect(labels).toEqual(["L2", "L3", "L1", "L5"]);
        const aHeader = screen.getByText("a.ts");
        const bHeader = screen.getByText("b.ts");
        expect(
            aHeader.compareDocumentPosition(bHeader) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    test("stale comments get an outdated badge, disabled checkbox, and no edit button", () => {
        setup({});
        expect(screen.getByText("outdated")).toBeInTheDocument();
        const checkboxes = screen.getAllByLabelText("Select comment");
        // document order: a.ts L2 (a1), a.ts L3 (a2, stale), b.ts L1, b.ts L5
        expect(checkboxes[1]).toBeDisabled();
        expect(checkboxes[0]).toBeEnabled();
        expect(screen.getAllByTitle("Edit comment")).toHaveLength(3);
        expect(screen.getAllByTitle("Delete comment")).toHaveLength(4);
    });

    test("file header checkbox reflects none/some/all selection", () => {
        // none selected
        const first = render(
            <CommentsPanelContent
                comments={comments}
                totalCount={4}
                selectedIds={new Set()}
                onToggleSelected={() => {}}
                onToggleFile={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
                onCopy={() => {}}
                scrollToId={null}
                onScrollHandled={() => {}}
                onJumpToDiff={() => {}}
            />,
        );
        expect(screen.getByLabelText("Select all comments in a.ts")).toHaveAttribute(
            "data-state",
            "unchecked",
        );
        first.unmount();

        // a.ts fully selected (a2 is stale so a1 alone is "all"), b.ts partially selected
        render(
            <CommentsPanelContent
                comments={comments}
                totalCount={4}
                selectedIds={new Set(["a1", "b2"])}
                onToggleSelected={() => {}}
                onToggleFile={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
                onCopy={() => {}}
                scrollToId={null}
                onScrollHandled={() => {}}
                onJumpToDiff={() => {}}
            />,
        );
        expect(screen.getByLabelText("Select all comments in a.ts")).toHaveAttribute(
            "data-state",
            "checked",
        );
        expect(screen.getByLabelText("Select all comments in b.ts")).toHaveAttribute(
            "data-state",
            "indeterminate",
        );
    });

    test("file with only stale comments has a disabled header checkbox", () => {
        setup({
            comments: { "c.ts": [makeComment({ id: "c1", filePath: "c.ts", stale: true })] },
            totalCount: 1,
        });
        expect(screen.getByLabelText("Select all comments in c.ts")).toBeDisabled();
    });

    test("toggling the file header selects the whole file", () => {
        const handlers = setup({});
        fireEvent.click(screen.getByLabelText("Select all comments in a.ts"));
        expect(handlers.fileToggles).toEqual([["a.ts", true]]);
    });

    test("toggling a fully selected file deselects it", () => {
        const handlers = setup({ selectedIds: new Set(["a1"]) });
        fireEvent.click(screen.getByLabelText("Select all comments in a.ts"));
        expect(handlers.fileToggles).toEqual([["a.ts", false]]);
    });

    test("footer shows the selection count and gates the copy button", () => {
        setup({});
        expect(screen.getByText("Nothing selected")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Copy for agent/ })).toBeDisabled();
    });

    test("copy calls onCopy and flips the label to Copied", () => {
        const handlers = setup({ selectedIds: new Set(["a1", "b1"]) });
        expect(screen.getByText("selected · ready to copy", { exact: false })).toBeInTheDocument();
        const button = screen.getByRole("button", { name: /Copy for agent/ });
        expect(button).toBeEnabled();
        fireEvent.click(button);
        expect(handlers.copies).toBe(1);
        expect(screen.getByText("Copied")).toBeInTheDocument();
    });

    test("selection excludes stale comments from the count", () => {
        setup({ selectedIds: new Set(["a1", "a2"]) });
        expect(screen.getByText("1")).toBeInTheDocument();
    });

    test("show in diff jumps to the comment", () => {
        const handlers = setup({});
        fireEvent.click(screen.getAllByTitle("Show in diff")[0]!);
        expect(handlers.jumps).toEqual(["a1"]);
    });

    test("row checkbox toggles the comment", () => {
        const handlers = setup({});
        fireEvent.click(screen.getAllByLabelText("Select comment")[0]!);
        expect(handlers.toggled).toEqual(["a1"]);
    });

    test("editing a comment saves through onEdit", () => {
        const handlers = setup({});
        fireEvent.click(screen.getAllByTitle("Edit comment")[0]!);
        const textarea = screen.getByDisplayValue("a two");
        fireEvent.change(textarea, { target: { value: "a two updated" } });
        fireEvent.click(screen.getByTitle("Save (⌘/Ctrl ↵)"));
        expect(handlers.edits).toEqual([["a1", "a two updated"]]);
    });

    test("delete propagates the comment id", () => {
        const handlers = setup({});
        fireEvent.click(screen.getAllByTitle("Delete comment")[0]!);
        expect(handlers.deletes).toEqual(["a1"]);
    });
});
