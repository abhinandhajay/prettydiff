export type {
    CommentAuthor,
    CommentLineType,
    CommentMap,
    CommentSide,
    CommentSnapshot,
    DiffComment,
    DiffPayload,
    ParsedFile,
    FileStatus,
    RepoInfo,
    HubIdentity,
    HubReposResponse,
} from "../../cli/types";

export interface DraftLine {
    filePath: string;
    side: CommentSide;
    lineNumber: number;
    lineType: CommentLineType;
    lineText: string;
}
