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

export type CommentSide = "additions" | "deletions";

export type CommentLineType =
    | "change-addition"
    | "change-deletion"
    | "context"
    | "context-expanded";

export interface CommentAuthor {
    kind: "user" | "agent";
    name?: string;
}

export interface DiffComment {
    id: string;
    filePath: string;
    side: CommentSide;
    lineNumber: number;
    lineType: CommentLineType;
    lineText: string;
    body: string;
    createdAt: number;
    author?: CommentAuthor;
    stale?: boolean;
}

export type CommentMap = Record<string, DiffComment[]>;

export interface CommentSnapshot {
    revision: number;
    comments: CommentMap;
}

export interface RepoInfo {
    id: string;
    repoRoot: string;
    isHub?: boolean;
    branch?: string;
}

export interface HubIdentity {
    app: "prettydiff";
    version: string;
    hubId: string;
}

export interface HubReposResponse {
    hubId: string;
    repos: RepoInfo[];
}

export interface RegisterRequest {
    repoRoot: string;
    clientId: string;
}

export interface RegisterResponse {
    hubId: string;
    repo: RepoInfo;
}

export interface HeartbeatRequest {
    repoId: string;
    clientId: string;
}

export interface UnregisterRequest {
    repoId: string;
    clientId: string;
}
