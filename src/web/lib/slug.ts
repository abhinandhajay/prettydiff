export function fileCardId(path: string): string {
    return `file-${encodeURIComponent(path)}`;
}
