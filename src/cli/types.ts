export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

export interface BranchRef {
    name: string;
    current?: boolean;
}

export interface DiffOptions {
    target: "working-tree" | "branch";
    targetRef?: string;
    includeWorkingTree?: boolean;
}

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
    branches: BranchRef[];
    head: string;
    target: DiffOptions["target"];
    targetRef?: string;
    mergeBase?: string;
    includeWorkingTree?: boolean;
    generatedAt: string;
    files: ParsedFile[];
}
