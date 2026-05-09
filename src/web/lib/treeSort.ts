import type { ParsedFile } from "./types";

/**
 * Compare two file paths the way @pierre/trees displays them: walk segments
 * left-to-right; at the first differing segment, paths inside a deeper directory
 * win over paths that terminate at this level (folders before files), and
 * otherwise compare case-insensitively + numerically.
 */
export function compareTreePath(a: string, b: string): number {
    const aParts = a.split("/");
    const bParts = b.split("/");
    const minLen = Math.min(aParts.length, bParts.length);

    for (let i = 0; i < minLen; i++) {
        if (aParts[i] === bParts[i]) continue;
        const aIsDir = i < aParts.length - 1;
        const bIsDir = i < bParts.length - 1;
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return aParts[i].localeCompare(bParts[i], undefined, {
            sensitivity: "base",
            numeric: true,
        });
    }

    return aParts.length - bParts.length;
}

export function sortFilesForTree(files: ParsedFile[]): ParsedFile[] {
    return [...files].sort((a, b) => compareTreePath(a.path, b.path));
}
