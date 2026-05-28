import type { DiffPayload } from "./types";

export async function fetchDiff(): Promise<DiffPayload> {
    const search = typeof window === "undefined" ? "" : window.location.search;
    const r = await fetch(`/api/diff${search}`);
    if (!r.ok) {
        throw new Error(`fetch /api/diff failed: ${r.status}`);
    }
    return r.json();
}
