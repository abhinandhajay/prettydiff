import type { DiffPayload } from "./types";

export interface FetchDiffOptions {
    target: "working-tree" | "branch";
    targetRef?: string | null;
    includeWorkingTree?: boolean;
}

export async function fetchDiff(options: FetchDiffOptions): Promise<DiffPayload> {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    params.set("target", options.target);
    if (options.target === "branch" && options.targetRef) {
        params.set("targetRef", options.targetRef);
        params.set("includeWorkingTree", options.includeWorkingTree === false ? "0" : "1");
    } else {
        params.delete("targetRef");
        params.delete("includeWorkingTree");
    }
    const query = params.toString();
    const r = await fetch(`/api/diff${query ? `?${query}` : ""}`);
    if (!r.ok) {
        throw new Error(`fetch /api/diff failed: ${r.status}`);
    }
    return r.json();
}
