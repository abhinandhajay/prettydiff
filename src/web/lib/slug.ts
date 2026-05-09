export function slug(path: string): string {
    return path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function fileCardId(path: string): string {
    return `file-${slug(path)}`;
}
