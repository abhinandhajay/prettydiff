import { describe, expect, test } from "bun:test";

import { COMMENTS_ADD_HELP, COMMENTS_HELP } from "./comments.js";
import { HELP, main, parseArgs } from "./main.js";
import { SKILL_HELP, SKILL_INSTALL_HELP } from "./skill.js";

describe("parseArgs", () => {
    test("defaults", () => {
        expect(parseArgs([])).toEqual({
            port: undefined,
            open: true,
            version: false,
            help: false,
            standalone: false,
        });
    });

    test("--port parses a number", () => {
        expect(parseArgs(["--port", "39412"]).port).toBe(39412);
    });

    test("--port with a non-numeric value is ignored", () => {
        expect(parseArgs(["--port", "abc"]).port).toBeUndefined();
    });

    test("--no-open disables opening the browser", () => {
        expect(parseArgs(["--no-open"]).open).toBe(false);
    });

    test.each([["-v"], ["--version"]])("%s sets version", (flag) => {
        expect(parseArgs([flag]).version).toBe(true);
    });

    test.each([["-h"], ["--help"]])("%s sets help", (flag) => {
        expect(parseArgs([flag]).help).toBe(true);
    });

    test("--standalone starts a separate server", () => {
        expect(parseArgs(["--standalone"]).standalone).toBe(true);
    });

    test("combined flags", () => {
        expect(parseArgs(["--no-open", "--port", "40000", "-v", "--standalone"])).toEqual({
            port: 40000,
            open: false,
            version: true,
            help: false,
            standalone: true,
        });
    });
});

describe("command dispatch", () => {
    async function run(argv: string[]) {
        let stdout = "";
        let stderr = "";
        const code = await main(argv, {
            cwd: "/",
            stdout: (text) => (stdout += text),
            stderr: (text) => (stderr += text),
        });
        return { code, stdout, stderr };
    }

    test.each([
        [["--help"], HELP],
        [["comments", "--help"], COMMENTS_HELP],
        [["comments", "add", "--help"], COMMENTS_ADD_HELP],
        [["skill", "--help"], SKILL_HELP],
        [["skill", "install", "--help"], SKILL_INSTALL_HELP],
    ])("help works outside a Git repository", async (argv, expected) => {
        expect(await run(argv as string[])).toEqual({ code: 0, stdout: expected, stderr: "" });
    });

    test("unknown root commands return a usage error", async () => {
        expect(await run(["wat"])).toEqual({
            code: 2,
            stdout: "",
            stderr: 'prettydiff: unknown command: wat\nRun "prettydiff --help" for usage.\n',
        });
    });
});
