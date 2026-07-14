import type { HubReposResponse } from "./types";

export async function fetchRepos(): Promise<HubReposResponse> {
    const r = await fetch("/api/hub/repos");
    if (!r.ok) {
        throw new Error(`fetch /api/hub/repos failed: ${r.status}`);
    }
    return r.json();
}
