export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

export interface ParsedFile {
    path: string;
    oldPath?: string;
    status: FileStatus;
    additions: number;
    deletions: number;
    rawPatch: string;
    oldContents?: string;
    newContents?: string;
    binary?: boolean;
    skipped?: { reason: "binary" | "too-large" | "no-hunks"; sizeBytes?: number };
}

export interface DiffPayload {
    repoRoot: string;
    branch: string;
    head: string;
    generatedAt: string;
    files: ParsedFile[];
}
