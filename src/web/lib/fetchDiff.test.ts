import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { fetchDiff } from "@/lib/fetchDiff";

import type { DiffPayload } from "@/lib/types";

const realFetch = globalThis.fetch;

const payload = { files: [] } as unknown as DiffPayload;

let requestedUrls: string[] = [];

function stubFetch(status = 200): void {
    const stub = async (input: string | URL | Request) => {
        requestedUrls.push(String(input));
        return new Response(JSON.stringify(payload), {
            status,
            headers: { "content-type": "application/json" },
        });
    };
    stub.preconnect = () => {};
    globalThis.fetch = stub as unknown as typeof fetch;
}

function lastQuery(): URLSearchParams {
    const url = requestedUrls.at(-1) ?? "";
    return new URLSearchParams(url.split("?")[1] ?? "");
}

interface HappyDOMWindow {
    happyDOM: { setURL: (url: string) => void };
}

function setPageUrl(url: string): void {
    (window as unknown as HappyDOMWindow).happyDOM.setURL(url);
}

beforeEach(() => {
    requestedUrls = [];
    setPageUrl("http://localhost/");
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("fetchDiff", () => {
    test("preserves existing query params like fixture", async () => {
        setPageUrl("http://localhost/?fixture=empty");
        stubFetch();
        await fetchDiff({ target: "working-tree" });
        const query = lastQuery();
        expect(query.get("fixture")).toBe("empty");
        expect(query.get("target")).toBe("working-tree");
        expect(query.has("targetRef")).toBe(false);
        expect(query.has("includeWorkingTree")).toBe(false);
    });

    test("sends targetRef and includeWorkingTree=1 in branch mode", async () => {
        stubFetch();
        await fetchDiff({ target: "branch", targetRef: "main" });
        const query = lastQuery();
        expect(query.get("target")).toBe("branch");
        expect(query.get("targetRef")).toBe("main");
        expect(query.get("includeWorkingTree")).toBe("1");
    });

    test("sends includeWorkingTree=0 when disabled", async () => {
        stubFetch();
        await fetchDiff({ target: "branch", targetRef: "main", includeWorkingTree: false });
        expect(lastQuery().get("includeWorkingTree")).toBe("0");
    });

    test("drops stale branch params when switching back to working tree", async () => {
        setPageUrl("http://localhost/?targetRef=old&includeWorkingTree=0");
        stubFetch();
        await fetchDiff({ target: "working-tree" });
        const query = lastQuery();
        expect(query.has("targetRef")).toBe(false);
        expect(query.has("includeWorkingTree")).toBe(false);
    });

    test("resolves with the parsed payload", async () => {
        stubFetch();
        expect(await fetchDiff({ target: "working-tree" })).toEqual(payload);
    });

    test("throws on non-ok responses", async () => {
        stubFetch(500);
        expect(fetchDiff({ target: "working-tree" })).rejects.toThrow(
            "fetch /api/diff failed: 500",
        );
    });
});
