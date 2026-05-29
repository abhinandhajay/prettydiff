export type SkippedReason = "binary" | "too-large" | "no-hunks" | "render-error";

const MESSAGES: Record<SkippedReason, string> = {
    binary: "Binary file — preview skipped.",
    "too-large": "File too large — preview skipped.",
    "no-hunks": "No textual changes — preview skipped.",
    "render-error": "Couldn't render this diff — preview skipped.",
};

export function SkippedPreview({ reason }: { reason: SkippedReason }) {
    return (
        <div className="text-muted-foreground px-3 py-3 text-center text-sm">
            {MESSAGES[reason]}
        </div>
    );
}
