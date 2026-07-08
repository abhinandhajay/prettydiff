import { describe, expect, test } from "bun:test";

import { displayPath, repoDisplayLabels } from "./format";

describe("displayPath", () => {
    test("shortens the home directory to ~", () => {
        expect(displayPath("/Users/abhi/GitHub/prettydiff")).toBe("~/GitHub/prettydiff");
        expect(displayPath("/home/dev/work/api")).toBe("~/work/api");
    });

    test("leaves non-home paths alone", () => {
        expect(displayPath("/opt/repos/x")).toBe("/opt/repos/x");
        expect(displayPath("/Users")).toBe("/Users");
    });

    test("normalizes backslashes", () => {
        expect(displayPath("D:\\repos\\x")).toBe("D:/repos/x");
    });
});

describe("repoDisplayLabels", () => {
    test("unique basenames stay bare", () => {
        const labels = repoDisplayLabels(["/a/app", "/a/api"]);
        expect(labels.get("/a/app")).toBe("app");
        expect(labels.get("/a/api")).toBe("api");
    });

    test("colliding basenames get the distinguishing parent segment", () => {
        const labels = repoDisplayLabels(["/x/a/repo", "/x/b/repo", "/y/solo"]);
        expect(labels.get("/x/a/repo")).toBe("repo — a");
        expect(labels.get("/x/b/repo")).toBe("repo — b");
        expect(labels.get("/y/solo")).toBe("solo");
    });

    test("goes deeper when the immediate parent also collides", () => {
        const labels = repoDisplayLabels(["/x/work/repo", "/y/work/repo"]);
        expect(labels.get("/x/work/repo")).toBe("repo — x/work");
        expect(labels.get("/y/work/repo")).toBe("repo — y/work");
    });

    test("identical roots do not loop forever", () => {
        const labels = repoDisplayLabels(["/x/repo", "/x/repo"]);
        expect(labels.get("/x/repo")).toBe("repo — x");
    });
});
