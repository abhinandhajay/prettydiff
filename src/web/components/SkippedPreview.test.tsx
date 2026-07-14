import { describe, expect, test } from "bun:test";

import { SkippedPreview, type SkippedReason } from "@/components/SkippedPreview";
import { render, screen } from "@testing-library/react";

describe("SkippedPreview", () => {
    const cases: Array<[SkippedReason, string]> = [
        ["binary", "Binary file — preview skipped."],
        ["too-large", "File too large — preview skipped."],
        ["no-hunks", "No textual changes — preview skipped."],
        ["render-error", "Couldn't render this diff — preview skipped."],
    ];

    test.each(cases)("%s renders its message", (reason, message) => {
        render(<SkippedPreview reason={reason} />);
        expect(screen.getByText(message)).toBeInTheDocument();
    });
});
