import { describe, expect, test } from "bun:test";

import { EmptyState } from "@/components/EmptyState";
import { render, screen } from "@testing-library/react";

describe("EmptyState", () => {
    test("renders the title for each kind", () => {
        for (const kind of ["loading", "error", "empty"] as const) {
            const { unmount } = render(<EmptyState kind={kind} title={`Title ${kind}`} />);
            expect(screen.getByText(new RegExp(`Title ${kind}`))).toBeInTheDocument();
            unmount();
        }
    });

    test("renders the message only when provided", () => {
        const { rerender } = render(<EmptyState kind="error" title="Oops" />);
        expect(screen.queryByText("it broke")).not.toBeInTheDocument();
        rerender(<EmptyState kind="error" title="Oops" message="it broke" />);
        expect(screen.getByText("it broke")).toBeInTheDocument();
    });

    test("loading strips the trailing ellipsis and animates it instead", () => {
        render(<EmptyState kind="loading" title="Preparing diff…" />);
        expect(screen.queryByText("Preparing diff…")).not.toBeInTheDocument();
        expect(screen.getByText(/Preparing diff/)).toBeInTheDocument();
        expect(screen.getByText("…")).toBeInTheDocument();
    });

    test("non-loading kinds have no animated ellipsis", () => {
        render(<EmptyState kind="empty" title="No changes" />);
        expect(screen.queryByText("…")).not.toBeInTheDocument();
    });
});
