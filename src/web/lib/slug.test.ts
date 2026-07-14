import { describe, expect, it } from "bun:test";

import { fileCardId, slug } from "@/lib/slug";

describe("slug", () => {
    it("collapses non-alphanumeric runs to single hyphens", () => {
        expect(slug("src/web/lib/comments.ts")).toBe("src-web-lib-comments-ts");
    });

    it("strips leading and trailing separators", () => {
        expect(slug("/a/b/")).toBe("a-b");
    });

    it("collides for paths that differ only in separators (by design)", () => {
        expect(slug("a/b.ts")).toBe(slug("a-b.ts"));
    });
});

describe("fileCardId", () => {
    it("prefixes the slug with file-", () => {
        expect(fileCardId("a/b.ts")).toBe("file-a-b-ts");
    });
});
