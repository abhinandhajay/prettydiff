export function repoBasename(repoRoot: string): string {
    return repoRoot.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
    const diff = Math.max(0, now - timestamp);
    const sec = Math.floor(diff / 1000);
    if (sec < 45) return "just now";
    const min = Math.max(1, Math.floor(sec / 60));
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk}w ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.max(1, Math.floor(day / 365))}y ago`;
}
