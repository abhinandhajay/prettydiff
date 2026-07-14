function pathSegments(p: string): string[] {
    return p.replace(/\\/g, "/").split("/").filter(Boolean);
}

export function repoBasename(repoRoot: string): string {
    return pathSegments(repoRoot).pop() ?? "";
}

export function displayPath(path: string): string {
    return path.replace(/\\/g, "/").replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
}

// Labels for a set of repo roots: the basename, plus — for colliding basenames
// (clones/worktrees of the same project) — as many trailing parent segments as
// needed to tell them apart, VS Code style: "repo — a" vs "repo — b".
export function repoDisplayLabels(repoRoots: string[]): Map<string, string> {
    const labels = new Map<string, string>();
    const groups = new Map<string, string[]>();
    for (const root of repoRoots) {
        const base = repoBasename(root);
        const group = groups.get(base);
        if (group) group.push(root);
        else groups.set(base, [root]);
    }
    for (const [base, roots] of groups) {
        if (roots.length === 1) {
            labels.set(roots[0], base);
            continue;
        }
        const maxDepth = Math.max(...roots.map((root) => pathSegments(root).length - 1));
        for (let depth = 1; depth <= Math.max(1, maxDepth); depth++) {
            const candidates = new Map<string, string>();
            const counts = new Map<string, number>();
            for (const root of roots) {
                const segments = pathSegments(root);
                const parents = segments.slice(
                    Math.max(0, segments.length - 1 - depth),
                    segments.length - 1,
                );
                const label = parents.length > 0 ? `${base} — ${parents.join("/")}` : base;
                candidates.set(root, label);
                counts.set(label, (counts.get(label) ?? 0) + 1);
            }
            const allDistinct = [...counts.values()].every((count) => count === 1);
            if (allDistinct || depth >= maxDepth) {
                for (const [root, label] of candidates) labels.set(root, label);
                break;
            }
        }
    }
    return labels;
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
    const diff = Math.max(0, now - timestamp);
    const sec = Math.floor(diff / 1000);
    if (sec < 45) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk}w ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(day / 365)}y ago`;
}
