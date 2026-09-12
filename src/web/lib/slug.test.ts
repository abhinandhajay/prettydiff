import { describe, expect, it } from "bun:test";

import { fileCardId } from "@/lib/slug";

describe("fileCardId", () => {
    it("encodes the full path with a file- prefix", () => {
        expect(fileCardId("a/b.ts")).toBe("file-a%2Fb.ts");
    });

    it("keeps distinct paths independently addressable in the document", () => {
        const paths = [
            "src/a-b.ts",
            "src/a_b.ts",
            "src/a/b.ts",
            "src/a%2Fb.ts",
            "src/a b.ts",
            "src/a.b.ts",
            "src/日本語.ts",
            "src/中文.ts",
            "src/a#b.ts",
            "src/a?b.ts",
        ];
        const container = document.createElement("div");
        const cards = paths.map((path) => {
            const card = document.createElement("section");
            card.id = fileCardId(path);
            container.append(card);
            return card;
        });
        document.body.append(container);
        try {
            for (const [index, path] of paths.entries()) {
                expect(document.getElementById(fileCardId(path))).toBe(cards[index]);
            }
        } finally {
            container.remove();
        }
    });
});
