import { describe, expect, test } from "bun:test";

import { parseArgs } from "./main.js";

describe("parseArgs", () => {
    test("defaults", () => {
        expect(parseArgs([])).toEqual({
            port: undefined,
            open: true,
            version: false,
            help: false,
        });
    });

    test("--port parses a number", () => {
        expect(parseArgs(["--port", "39412"]).port).toBe(39412);
    });

    test("--port with a non-numeric value yields NaN", () => {
        expect(Number.isNaN(parseArgs(["--port", "abc"]).port)).toBe(true);
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

    test("combined flags", () => {
        expect(parseArgs(["--no-open", "--port", "40000", "-v"])).toEqual({
            port: 40000,
            open: false,
            version: true,
            help: false,
        });
    });
});
