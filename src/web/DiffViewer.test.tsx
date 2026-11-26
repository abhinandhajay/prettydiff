import { afterEach, beforeEach, expect, test } from "bun:test";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DiffViewer } from "./DiffViewer";

import type { DiffPayload } from "./lib/types";

const originalFetch = globalThis.fetch;
const props = {
    repos: [],
    onRepoChange: () => {},
    refreshRepos: () => {},
    onUnknownRepo: () => {},
    reconnecting: false,
};
const payload: DiffPayload = {
    repoRoot: "/tmp/recovery-repo",
    branch: "main",
    files: [],
    target: "working-tree",
    branches: [],
    head: "abc123",
    generatedAt: "2026-09-11T00:00:00Z",
};

function json(body: unknown) {
    return Response.json(body);
}

function mockDiff(handler: () => Promise<Response> | Response) {
    globalThis.fetch = (async (input) =>
        String(input).startsWith("/api/diff")
            ? handler()
            : json({ revision: 0, comments: {} })) as typeof fetch;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
    globalThis.fetch = originalFetch;
});

test("retries an initial failure, shows loading, and allows another retry after failure", async () => {
    let calls = 0;
    let resolve!: (response: Response) => void;
    mockDiff(() => {
        calls++;
        if (calls === 1) return new Response(null, { status: 500 });
        if (calls === 2) return new Promise((done) => (resolve = done));
        return json(payload);
    });
    render(<DiffViewer {...props} />);
    await screen.findByText("Couldn't load diff");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.queryByText("Couldn't load diff")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    await act(async () => resolve(new Response(null, { status: 503 })));
    await screen.findByText("fetch /api/diff failed: 503");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No changes");
    expect(screen.queryByText("Couldn't load diff")).not.toBeInTheDocument();
    expect(calls).toBe(3);
});

test("recovers an initial failure when the hub reconnects", async () => {
    let calls = 0;
    mockDiff(() => (++calls === 1 ? new Response(null, { status: 500 }) : json(payload)));
    const { rerender } = render(<DiffViewer {...props} />);
    await screen.findByText("Couldn't load diff");
    rerender(<DiffViewer {...props} reconnecting />);
    expect(calls).toBe(1);
    rerender(<DiffViewer {...props} />);
    await screen.findByText("No changes");
    expect(screen.queryByText("Couldn't load diff")).not.toBeInTheDocument();
    expect(calls).toBe(2);
});

for (const staleStatus of [200, 500, 404]) {
    test(`ignores stale ${staleStatus} responses after reconnect recovery`, async () => {
        let calls = 0;
        let unknownRepos = 0;
        let resolve!: (response: Response) => void;
        mockDiff(() => {
            calls++;
            if (calls === 1) return new Response(null, { status: 500 });
            if (calls === 2) return new Promise((done) => (resolve = done));
            return json(payload);
        });
        const stableProps = { ...props, onUnknownRepo: () => unknownRepos++ };
        const { rerender } = render(<DiffViewer {...stableProps} />);
        await screen.findByText("Couldn't load diff");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        rerender(<DiffViewer {...stableProps} reconnecting />);
        rerender(<DiffViewer {...stableProps} />);
        await screen.findByText("No changes");
        await act(async () =>
            resolve(
                staleStatus === 200
                    ? json({ ...payload, repoRoot: "/tmp/stale-repo" })
                    : new Response(null, { status: staleStatus }),
            ),
        );
        expect(screen.queryByText("Couldn't load diff")).not.toBeInTheDocument();
        expect(screen.queryByText("stale-repo")).not.toBeInTheDocument();
        expect(unknownRepos).toBe(0);
        expect(calls).toBe(3);
    });
}

test("ignores an outstanding failure after unmount", async () => {
    let resolve!: (response: Response) => void;
    let unknownRepos = 0;
    mockDiff(() => new Promise((done) => (resolve = done)));
    const { unmount } = render(<DiffViewer {...props} onUnknownRepo={() => unknownRepos++} />);
    await waitFor(() => expect(resolve).toBeDefined());
    unmount();
    await act(async () => resolve(new Response(null, { status: 404 })));
    expect(unknownRepos).toBe(0);
});
