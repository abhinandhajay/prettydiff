import type { DiffPayload } from "./types";

export async function fetchDiff(): Promise<DiffPayload> {
    const r = await fetch("/api/diff");
    if (!r.ok) {
        throw new Error(`fetch /api/diff failed: ${r.status}`);
    }
    return r.json();
}
