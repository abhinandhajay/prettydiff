export type {
    DiffPayload,
    ParsedFile,
    FileStatus,
    RepoInfo,
    HubIdentity,
    HubReposResponse,
} from "../../cli/types";

export type CommentSide = "additions" | "deletions";

export type CommentLineType =
    | "change-addition"
    | "change-deletion"
    | "context"
    | "context-expanded";

export interface DiffComment {
    id: string;
    filePath: string;
    side: CommentSide;
    lineNumber: number;
    lineType: CommentLineType;
    lineText: string;
    body: string;
    createdAt: number;
    stale?: boolean;
}

export type CommentMap = Record<string, DiffComment[]>;

export interface DraftLine {
    filePath: string;
    side: CommentSide;
    lineNumber: number;
    lineType: CommentLineType;
    lineText: string;
}
