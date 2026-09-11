import { afterEach, expect, test } from "bun:test";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DiffViewer } from "./DiffViewer";

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
});

const noop = () => {};

test("empty diffs keep outdated comments accessible and deletable", async () => {
    localStorage.clear();
    let deleted = false;
    globalThis.fetch = (async (input, init) => {
        if (String(input).startsWith("/api/diff")) {
            return Response.json({
                repoName: "review",
                repoRoot: "/tmp/review",
                branch: "main",
                files: [],
                branches: [],
                target: "working-tree",
            });
        }
        if (init?.method === "DELETE") deleted = true;
        return Response.json({
            revision: deleted ? 2 : 1,
            comments: deleted
                ? {}
                : {
                      "a.ts": [
                          {
                              id: "stored",
                              filePath: "a.ts",
                              side: "additions",
                              lineNumber: 1,
                              lineType: "change-addition",
                              lineText: "changed",
                              body: "Review this change",
                              createdAt: 1,
                              stale: true,
                          },
                      ],
                  },
        });
    }) as typeof fetch;

    render(
        <DiffViewer
            repos={[]}
            onRepoChange={noop}
            refreshRepos={noop}
            onUnknownRepo={noop}
            reconnecting={false}
        />,
    );
    await screen.findByText("Selected diff has no changes.");
    fireEvent.click(screen.getByRole("radio", { name: "Show comments" }));
    expect(await screen.findByText("Review this change")).toBeInTheDocument();
    expect(screen.getByText("outdated")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Delete comment"));
    await waitFor(() => expect(screen.queryByText("Review this change")).not.toBeInTheDocument());
    expect(deleted).toBe(true);
    expect(screen.getByText("Selected diff has no changes.")).toBeInTheDocument();
});
