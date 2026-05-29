import { CommentComposer } from "@/components/CommentComposer";
import { CommentIndicator } from "@/components/CommentIndicator";
import { DiffFileHeader } from "@/components/DiffFileHeader";
import { PatchErrorBoundary } from "@/components/PatchErrorBoundary";
import { SkippedPreview } from "@/components/SkippedPreview";
import { commentKey, commentsByKey } from "@/lib/comments";
import { getSingularPatch } from "@pierre/diffs";
import { CodeView } from "@pierre/diffs/react";
import { Plus } from "lucide-react";
import {
    forwardRef,
    memo,
    useCallback,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";

import type { SkippedReason } from "@/components/SkippedPreview";
import type { ViewMode } from "@/components/ViewToggle";
import type { PatchLineIndex } from "@/lib/comments";
import type {
    CommentLineType,
    CommentMap,
    CommentSide,
    DiffComment,
    DraftLine,
    ParsedFile,
} from "@/lib/types";
import type {
    CodeView as CodeViewInstance,
    CodeViewItem,
    CodeViewOptions,
    DiffLineAnnotation,
    FileDiffMetadata,
    LineAnnotation,
} from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";

type AnnotationMeta =
    | { kind: "draft" }
    | { kind: "existing"; comment: DiffComment }
    | { kind: "skipped"; reason: SkippedReason };

export interface DiffCodeViewHandle {
    scrollToItem(path: string): void;
    scrollToLine(filePath: string, lineNumber: number, side: CommentSide): void;
}

interface Props {
    files: ParsedFile[];
    viewMode: ViewMode;
    wrap: boolean;
    comments: CommentMap;
    openMap: Record<string, boolean>;
    patchIndexByPath: Map<string, PatchLineIndex>;
    activeDraft: DraftLine | null;
    onToggleOpen: (path: string) => void;
    onRequestDraft: (draft: DraftLine) => void;
    onCancelDraft: () => void;
    onSaveDraft: (body: string) => void;
    onFocusComment: (id: string) => void;
    onEditComment: (id: string, body: string) => void;
    onDeleteComment: (id: string) => void;
    flashCommentId: string | null;
    onActivePathChange: (path: string) => void;
}

function GutterAddButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                width: "calc(1lh - 2px)",
                height: "calc(1lh - 2px)",
                marginRight: "calc(1ch - 1lh + 1px)",
                marginTop: "1px",
                boxShadow:
                    "0 0 0 1px color-mix(in oklab, var(--color-primary) 65%, transparent), 0 2px 6px -2px color-mix(in oklab, var(--color-primary) 50%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.18)",
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 relative z-5 inline-flex shrink-0 items-center justify-center rounded-md transition-[transform,background-color] duration-100 ease-out hover:scale-105 active:scale-95"
            title="Add comment to this line"
            aria-label="Add comment to this line"
        >
            <Plus className="size-3" strokeWidth={3} />
        </button>
    );
}

function deriveLineType(
    index: PatchLineIndex,
    side: CommentSide,
    lineNumber: number,
): { lineType: CommentLineType; lineText: string } | null {
    const additionText = index.additions.get(lineNumber);
    const deletionText = index.deletions.get(lineNumber);
    if (side === "additions") {
        if (additionText === undefined) return null;
        if (deletionText !== undefined && deletionText === additionText) {
            return { lineType: "context", lineText: additionText };
        }
        return { lineType: "change-addition", lineText: additionText };
    }
    if (deletionText === undefined) return null;
    if (additionText !== undefined && additionText === deletionText) {
        return { lineType: "context", lineText: deletionText };
    }
    return { lineType: "change-deletion", lineText: deletionText };
}

function buildDiffAnnotations(
    file: ParsedFile,
    fileComments: DiffComment[],
    activeDraft: DraftLine | null,
): DiffLineAnnotation<AnnotationMeta>[] {
    const grouped = commentsByKey(fileComments.filter((c) => !c.stale));
    const annotations: DiffLineAnnotation<AnnotationMeta>[] = [];

    for (const [, group] of grouped) {
        const first = group[0]!;
        annotations.push({
            side: first.side,
            lineNumber: first.lineNumber,
            metadata: { kind: "existing", comment: first },
        });
    }

    if (
        activeDraft &&
        activeDraft.filePath === file.path &&
        !grouped.has(commentKey(activeDraft))
    ) {
        annotations.push({
            side: activeDraft.side,
            lineNumber: activeDraft.lineNumber,
            metadata: { kind: "draft" },
        });
    }

    return annotations;
}

// Injected into every item's shadow root.
//   1. Skipped files are the only `type:'file'` items (all real diffs are
//      `type:'diff'`), so `pre[data-file]` targets just them: hide the
//      placeholder code line/gutter so only the SkippedPreview shows.
//   2. `overflow: 'scroll'` makes the code reserve a horizontal-scrollbar gutter
//      even when lines fit, leaving an asymmetric gap under the last line. `auto`
//      only shows the scrollbar when content actually overflows.
const DIFF_UNSAFE_CSS = `
    pre[data-file] [data-line-index],
    pre[data-file] [data-gutter-buffer] { display: none !important; }
    pre[data-file] code { --diffs-column-number-width: 0px !important; }
    pre[data-overflow="scroll"] code { overflow-x: auto; }
`;

// CodeView reconciles reused item records by `version` and ignores changes to
// `collapsed`/`annotations` unless the version differs (see syncItemRecord in
// the library). This signature captures every mutable input so we can bump the
// version exactly when an item's rendered state must change.
function itemSignature(
    collapsed: boolean,
    annotations: (DiffLineAnnotation<AnnotationMeta> | LineAnnotation<AnnotationMeta>)[],
): string {
    let sig = collapsed ? "c1" : "c0";
    for (const a of annotations) {
        const side = "side" in a ? a.side : "f";
        const m = a.metadata;
        if (m.kind === "existing") {
            sig += `|e:${side}:${a.lineNumber}:${m.comment.id}:${m.comment.stale ? 1 : 0}:${m.comment.body}`;
        } else if (m.kind === "draft") {
            sig += `|d:${side}:${a.lineNumber}`;
        } else {
            sig += `|s:${m.reason}`;
        }
    }
    return sig;
}

function skippedItem(
    file: ParsedFile,
    collapsed: boolean,
    version: number,
): CodeViewItem<AnnotationMeta> {
    const reason: SkippedReason = file.skipped?.reason ?? "render-error";
    return {
        id: file.path,
        type: "file",
        // CodeView needs a line to anchor the annotation; the single blank line
        // stays hidden behind the SkippedPreview message rendered on it.
        file: { name: file.path, contents: " " },
        annotations: [{ lineNumber: 1, metadata: { kind: "skipped", reason } }],
        collapsed,
        version,
    };
}

const DiffCodeViewImpl = forwardRef<DiffCodeViewHandle, Props>(function DiffCodeView(
    {
        files,
        viewMode,
        wrap,
        comments,
        openMap,
        patchIndexByPath,
        activeDraft,
        onToggleOpen,
        onRequestDraft,
        onCancelDraft,
        onSaveDraft,
        onFocusComment,
        onEditComment,
        onDeleteComment,
        flashCommentId,
        onActivePathChange,
    },
    ref,
) {
    const cvRef = useRef<CodeViewHandle<AnnotationMeta>>(null);

    // Monotonic per-file version, bumped only when an item's signature changes.
    const versionsRef = useRef(new Map<string, { sig: string; version: number }>());
    const versionFor = useCallback((path: string, sig: string) => {
        const cache = versionsRef.current;
        const prev = cache.get(path);
        if (prev && prev.sig === sig) return prev.version;
        const version = (prev?.version ?? 0) + 1;
        cache.set(path, { sig, version });
        return version;
    }, []);

    useImperativeHandle(
        ref,
        () => ({
            scrollToItem(path) {
                cvRef.current?.scrollTo({ type: "item", id: path, align: "start" });
            },
            scrollToLine(filePath, lineNumber, side) {
                cvRef.current?.scrollTo({
                    type: "line",
                    id: filePath,
                    lineNumber,
                    side,
                    align: "center",
                    behavior: "smooth",
                });
            },
        }),
        [],
    );

    const filesByPath = useMemo(() => {
        const map = new Map<string, ParsedFile>();
        for (const f of files) map.set(f.path, f);
        return map;
    }, [files]);

    // Parse patches only when the file set changes — comment/draft/collapse
    // updates rebuild the items array but reuse these cached diffs so CodeView
    // never re-highlights on annotation-only changes.
    const fileDiffs = useMemo(() => {
        const map = new Map<string, FileDiffMetadata | "error">();
        for (const file of files) {
            if (file.skipped) continue;
            try {
                map.set(file.path, getSingularPatch(file.rawPatch));
            } catch (e) {
                console.error("prettydiff: failed to parse patch", file.path, e);
                map.set(file.path, "error");
            }
        }
        return map;
    }, [files]);

    const items = useMemo<CodeViewItem<AnnotationMeta>[]>(() => {
        const list: CodeViewItem<AnnotationMeta>[] = [];
        for (const file of files) {
            const collapsed = !(openMap[file.path] ?? true);
            const fileDiff = fileDiffs.get(file.path);
            if (file.skipped || fileDiff == null || fileDiff === "error") {
                const item = skippedItem(file, collapsed, 0);
                item.version = versionFor(
                    file.path,
                    itemSignature(collapsed, item.annotations ?? []),
                );
                list.push(item);
                continue;
            }
            const annotations = buildDiffAnnotations(file, comments[file.path] ?? [], activeDraft);
            list.push({
                id: file.path,
                type: "diff",
                fileDiff,
                annotations,
                collapsed,
                version: versionFor(file.path, itemSignature(collapsed, annotations)),
            });
        }
        return list;
    }, [files, fileDiffs, comments, activeDraft, openMap, versionFor]);

    // CodeView positions the gutter-utility slot on hover via direct DOM but
    // does not re-publish the React slot snapshot, so the gutter content is only
    // re-evaluated when React re-renders. Tracking the hovered line in state
    // (set from onLineEnter/onLineLeave) forces that re-render and gives
    // renderGutterUtility a fresh `getHoveredLine()` result.
    const [hovered, setHovered] = useState<{
        itemId: string;
        lineNumber: number;
        side: CommentSide;
    } | null>(null);
    const handleLineEnter = useCallback(
        (
            props: { lineNumber: number; annotationSide?: CommentSide },
            context: { item: { id: string } },
        ) => {
            // Only diff lines carry a side and can take a comment; file items
            // (skipped files) have no annotationSide, so leave hover unset.
            if (props.annotationSide == null) {
                setHovered(null);
                return;
            }
            setHovered({
                itemId: context.item.id,
                lineNumber: props.lineNumber,
                side: props.annotationSide,
            });
        },
        [],
    );
    const handleLineLeave = useCallback(() => setHovered(null), []);

    const options = useMemo<CodeViewOptions<AnnotationMeta>>(
        () => ({
            diffStyle: viewMode,
            overflow: wrap ? "wrap" : "scroll",
            stickyHeaders: true,
            enableGutterUtility: true,
            unsafeCSS: DIFF_UNSAFE_CSS,
            onLineEnter: handleLineEnter,
            onLineLeave: handleLineLeave,
        }),
        [viewMode, wrap, handleLineEnter, handleLineLeave],
    );

    const rafRef = useRef(0);
    const handleScroll = useCallback(
        (scrollTop: number, viewer: CodeViewInstance<AnnotationMeta>) => {
            if (rafRef.current) return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = 0;
                let active: string | null = files[0]?.path ?? null;
                for (const f of files) {
                    const top = viewer.getTopForItem(f.path);
                    if (top == null) continue;
                    if (top - scrollTop <= 1) active = f.path;
                    else break;
                }
                if (active) onActivePathChange(active);
            });
        },
        [files, onActivePathChange],
    );

    const renderCustomHeader = useCallback(
        (item: CodeViewItem<AnnotationMeta>) => {
            const file = filesByPath.get(item.id);
            if (!file) return null;
            return (
                <DiffFileHeader
                    file={file}
                    open={openMap[item.id] ?? true}
                    commentCount={comments[item.id]?.length ?? 0}
                    onToggle={onToggleOpen}
                />
            );
        },
        [filesByPath, openMap, comments, onToggleOpen],
    );

    const renderAnnotation = useCallback(
        (annotation: LineAnnotation<AnnotationMeta> | DiffLineAnnotation<AnnotationMeta>) => {
            const meta = annotation.metadata;
            if (meta.kind === "skipped") return <SkippedPreview reason={meta.reason} />;
            if (meta.kind === "draft") {
                return <CommentComposer onSave={onSaveDraft} onCancel={onCancelDraft} />;
            }
            return (
                <CommentIndicator
                    comment={meta.comment}
                    onEdit={onEditComment}
                    onDelete={onDeleteComment}
                    onFocusInSidebar={onFocusComment}
                    flash={flashCommentId === meta.comment.id}
                />
            );
        },
        [
            onSaveDraft,
            onCancelDraft,
            onEditComment,
            onDeleteComment,
            onFocusComment,
            flashCommentId,
        ],
    );

    const handleGutterClick = useCallback(
        (path: string, hover: { lineNumber: number; side: CommentSide }) => {
            const index = patchIndexByPath.get(path);
            if (!index) return;
            const derived = deriveLineType(index, hover.side, hover.lineNumber);
            if (!derived) return;
            onRequestDraft({
                filePath: path,
                side: hover.side,
                lineNumber: hover.lineNumber,
                lineType: derived.lineType,
                lineText: derived.lineText,
            });
        },
        [patchIndexByPath, onRequestDraft],
    );

    const renderGutterUtility = useCallback(
        (_getHoveredLine: unknown, item: CodeViewItem<AnnotationMeta>) => {
            // Driven by our own `hovered` state (not the library's getHoveredLine)
            // so the gutter slot re-renders on hover — see handleLineEnter.
            if (item.type !== "diff" || hovered == null || hovered.itemId !== item.id) {
                return null;
            }
            const { lineNumber, side } = hovered;
            const occupied = item.annotations?.some(
                (a) => a.side === side && a.lineNumber === lineNumber,
            );
            if (occupied) return null;
            return (
                <GutterAddButton onClick={() => handleGutterClick(item.id, { lineNumber, side })} />
            );
        },
        [handleGutterClick, hovered],
    );

    return (
        <PatchErrorBoundary
            fallback={
                <div className="text-muted-foreground p-8 text-center text-sm">
                    Couldn't render the diff view.
                </div>
            }
        >
            <CodeView<AnnotationMeta>
                ref={cvRef}
                className="h-full overflow-y-auto px-5"
                items={items}
                options={options}
                onScroll={handleScroll}
                renderCustomHeader={renderCustomHeader}
                renderAnnotation={renderAnnotation}
                renderGutterUtility={renderGutterUtility}
            />
        </PatchErrorBoundary>
    );
});

export const DiffCodeView = memo(DiffCodeViewImpl);
