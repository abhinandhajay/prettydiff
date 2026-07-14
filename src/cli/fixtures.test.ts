import { describe, expect, test } from "bun:test";
import path from "node:path";

import type { DiffPayload } from "./types.js";

const FILE_STATUSES = ["added", "modified", "deleted", "renamed", "untracked"];
const SKIP_REASONS = ["binary", "too-large", "no-hunks"];
const FIXTURES = ["sample-diff.json", "sample-diff-empty.json", "sample-diff-xl.json"];
const fixturesDir = path.resolve(import.meta.dir, "..", "..", "fixtures");

// The dev middleware serves these files raw, so they must stay valid DiffPayloads.
describe("fixture payload shape", () => {
    test.each(FIXTURES.map((name) => [name]))("%s is a valid DiffPayload", async (name) => {
        const payload = (await Bun.file(path.join(fixturesDir, name)).json()) as DiffPayload;

        expect(typeof payload.repoRoot).toBe("string");
        expect(typeof payload.branch).toBe("string");
        expect(typeof payload.head).toBe("string");
        expect(Number.isNaN(Date.parse(payload.generatedAt))).toBe(false);
        expect(["working-tree", "branch"]).toContain(payload.target);

        expect(Array.isArray(payload.branches)).toBe(true);
        for (const branch of payload.branches) {
            expect(typeof branch.name).toBe("string");
        }
        expect(payload.branches.filter((b) => b.current).length).toBeLessThanOrEqual(1);

        expect(Array.isArray(payload.files)).toBe(true);
        for (const file of payload.files) {
            expect(typeof file.path).toBe("string");
            expect(FILE_STATUSES).toContain(file.status);
            expect(typeof file.additions).toBe("number");
            expect(typeof file.deletions).toBe("number");
            expect(typeof file.rawPatch).toBe("string");
            if (file.skipped) {
                expect(SKIP_REASONS).toContain(file.skipped.reason);
            }
        }
    });
});
