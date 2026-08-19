import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { act, renderHook, waitFor } from "@testing-library/react";

import { useComments } from "./useComments";

const originalFetch = globalThis.fetch;

function response(body: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
        ...init,
    });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("useComments", () => {
    test("loads shared comments and imports legacy localStorage once", async () => {
        localStorage.setItem(
            "prettydiff:repo-1:comments",
            JSON.stringify({ "a.ts": [{ id: "legacy" }] }),
        );
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        globalThis.fetch = (async (input, init) => {
            const url = String(input);
            calls.push({ url, init });
            if (url.includes("/import")) {
                return response({ revision: 2, comments: { "a.ts": [{ id: "legacy" }] } });
            }
            return response(
                { revision: 1, comments: {} },
                { headers: { "content-type": "application/json", etag: '"1"' } },
            );
        }) as typeof fetch;

        const { result } = renderHook(() =>
            useComments({
                repoId: "repo-1",
                target: "working-tree",
                targetRef: null,
                includeWorkingTree: true,
            }),
        );

        await waitFor(() => expect(result.current.comments["a.ts"]).toHaveLength(1));
        expect(calls.some((call) => call.url.includes("/api/comments/import"))).toBe(true);
        expect(localStorage.getItem("prettydiff:repo-1:comments")).toBeNull();
    });

    test("shows a created comment before persistence completes", async () => {
        let resolveCreate!: (value: Response) => void;
        let postedComment: Record<string, unknown> | undefined;
        const createResponse = new Promise<Response>((resolve) => (resolveCreate = resolve));
        globalThis.fetch = (async (_input, init) => {
            if (init?.method === "POST") {
                postedComment = JSON.parse(String(init.body)) as Record<string, unknown>;
                return createResponse;
            }
            return response({ revision: 1, comments: {} });
        }) as typeof fetch;

        const { result } = renderHook(() =>
            useComments({
                target: "working-tree",
                targetRef: null,
                includeWorkingTree: true,
            }),
        );
        await waitFor(() => expect(result.current.error).toBeNull());

        await act(async () => {
            await result.current.create(
                {
                    filePath: "a.ts",
                    side: "additions",
                    lineNumber: 1,
                    lineType: "change-addition",
                    lineText: "x",
                },
                "note",
            );
        });
        expect(result.current.comments["a.ts"]?.[0]).toEqual(
            expect.objectContaining({ body: "note", author: { kind: "user" } }),
        );

        resolveCreate(
            response({ revision: 2, comments: { "a.ts": [{ ...postedComment, body: "saved" }] } }),
        );
        await waitFor(() => expect(result.current.comments["a.ts"]?.[0]?.body).toBe("saved"));
    });

    test("rolls back an optimistic comment when persistence fails", async () => {
        let rejectCreate!: (value: Response) => void;
        const createResponse = new Promise<Response>((resolve) => (rejectCreate = resolve));
        globalThis.fetch = (async (_input, init) =>
            init?.method === "POST"
                ? createResponse
                : response({ revision: 1, comments: {} })) as typeof fetch;

        const { result } = renderHook(() =>
            useComments({
                target: "working-tree",
                targetRef: null,
                includeWorkingTree: true,
            }),
        );
        await waitFor(() => expect(result.current.error).toBeNull());

        await act(async () => {
            await result.current.create(
                {
                    filePath: "a.ts",
                    side: "additions",
                    lineNumber: 1,
                    lineType: "change-addition",
                    lineText: "x",
                },
                "note",
            );
        });
        expect(result.current.comments["a.ts"]).toHaveLength(1);

        rejectCreate(response({ error: "disk is read-only" }, { status: 500 }));
        await waitFor(() => expect(result.current.error).toBe("disk is read-only"));
        expect(result.current.comments).toEqual({});
    });
});
