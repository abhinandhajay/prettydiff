import { describe, expect, mock, test } from "bun:test";

import { buildFileIndex } from "@/lib/comments";
import { fireEvent, render, within } from "@testing-library/react";

import type { DiffComment, ParsedFile } from "@/lib/types";
import type { DiffLineAnnotation } from "@pierre/diffs";
import type { ReactNode } from "react";

mock.module("@pierre/diffs/react", () => ({
    MultiFileDiff: ({
        lineAnnotations,
        renderAnnotation,
    }: {
        lineAnnotations: DiffLineAnnotation<unknown>[];
        renderAnnotation: (annotation: DiffLineAnnotation<unknown>) => ReactNode;
    }) => (
        <>
            {lineAnnotations.map((annotation) => (
                <div key={`${annotation.side}-${annotation.lineNumber}`} data-testid="annotation">
                    {renderAnnotation(annotation)}
                </div>
            ))}
        </>
    ),
}));

const { FileCard } = await import("./FileCard");
const file: ParsedFile = {
    path: "a.txt",
    status: "modified",
    additions: 1,
    deletions: 1,
    oldContents: "old\n",
    newContents: "new\n",
    rawPatch: "@@ -1 +1 @@\n-old\n+new\n",
};
const comments: DiffComment[] = ["first", "second", "third"].map((id) => ({
    id,
    filePath: file.path,
    side: "additions",
    lineNumber: 1,
    lineType: "change-addition",
    lineText: "new",
    body: `${id} note`,
    createdAt: 1,
}));

function setup(items = comments) {
    const onEditComment = mock();
    const onDeleteComment = mock();
    const onFocusComment = mock();
    const props = {
        file,
        open: true,
        onOpenChange: mock(),
        viewMode: "split" as const,
        wrap: false,
        comments: items,
        patchIndex: buildFileIndex(file),
        estimatedHeight: 100,
        eager: true,
        activeDraft: null,
        onRequestDraft: mock(),
        onCancelDraft: mock(),
        onSaveDraft: mock(),
        onFocusComment,
        onEditComment,
        onDeleteComment,
        flashCommentId: "second",
        onRenderComplete: mock(),
    };
    return {
        ...render(<FileCard {...props} />),
        props,
        onEditComment,
        onDeleteComment,
        onFocusComment,
    };
}

describe("FileCard grouped comments", () => {
    test("renders every comment with an individual navigation target and flash state", () => {
        const { getAllByTestId } = setup();
        expect(getAllByTestId("annotation")).toHaveLength(1);
        for (const comment of comments) {
            const target = document.getElementById(`comment-line-${comment.id}`);
            expect(target).toHaveTextContent(comment.body);
            expect(target?.classList.contains("bg-primary/10")).toBe(comment.id === "second");
        }
    });

    test("edits, deletes, and focuses later comments by their own IDs", () => {
        const { onEditComment, onDeleteComment, onFocusComment, rerender, props } = setup();
        const second = document.getElementById("comment-line-second");
        expect(second).not.toBeNull();
        const controls = within(second!);
        fireEvent.click(controls.getByTitle("Show in sidebar"));
        expect(onFocusComment).toHaveBeenCalledWith("second");
        fireEvent.click(controls.getByTitle("Edit"));
        fireEvent.change(controls.getByRole("textbox"), { target: { value: "edited second" } });
        // Removing an earlier sibling must preserve the editor on the same comment.
        rerender(<FileCard {...props} comments={comments.slice(1)} />);
        fireEvent.click(controls.getByTitle("Save (⌘/Ctrl ↵)"));
        expect(onEditComment).toHaveBeenCalledWith("second", "edited second");
        fireEvent.click(controls.getByTitle("Delete"));
        expect(onDeleteComment).toHaveBeenCalledWith("second");
        expect(document.getElementById("comment-line-third")).toHaveTextContent("third note");
    });

    test("excludes stale comments and separates opposite sides of the same line", () => {
        const { getAllByTestId } = setup([
            { ...comments[0]!, stale: true },
            comments[1]!,
            { ...comments[2]!, side: "deletions", lineType: "change-deletion", lineText: "old" },
        ]);
        expect(document.getElementById("comment-line-first")).toBeNull();
        expect(getAllByTestId("annotation")).toHaveLength(2);
        expect(document.getElementById("comment-line-second")).toHaveTextContent("second note");
        expect(document.getElementById("comment-line-third")).toHaveTextContent("third note");
    });
});
