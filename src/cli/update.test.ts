import { afterEach, describe, expect, test } from "bun:test";

import {
    checkForUpdate,
    detectInstaller,
    formatUpdateNotice,
    isNewer,
    supportsColor,
    updateCommand,
} from "./update.js";

describe("detectInstaller", () => {
    const cases: Array<[string, ReturnType<typeof detectInstaller>]> = [
        [
            "/Users/x/.bun/install/global/node_modules/@abhinandhajay/prettydiff/dist/cli/bin.js",
            "bun",
        ],
        [
            "/Users/x/Library/pnpm/global/5/node_modules/@abhinandhajay/prettydiff/dist/cli/bin.js",
            "pnpm",
        ],
        [
            "/Users/x/.local/share/pnpm/node_modules/@abhinandhajay/prettydiff/dist/cli/bin.js",
            "pnpm",
        ],
        [
            "C:\\Users\\x\\AppData\\Local\\pnpm\\node_modules\\@abhinandhajay\\prettydiff\\dist\\cli\\bin.js",
            "pnpm",
        ],
        [
            "/Users/x/.config/yarn/global/node_modules/@abhinandhajay/prettydiff/dist/cli/bin.js",
            "yarn",
        ],
        ["/usr/local/lib/node_modules/@abhinandhajay/prettydiff/dist/cli/bin.js", "npm"],
        [
            "/Users/x/.nvm/versions/node/v22.0.0/lib/node_modules/@abhinandhajay/prettydiff/dist/cli/bin.js",
            "npm",
        ],
        ["/Users/x/code/prettydiff/dist/cli/bin.js", "npm"],
    ];

    for (const [path, expected] of cases) {
        test(`${expected} ← ${path}`, () => {
            expect(detectInstaller(path)).toBe(expected);
        });
    }

    test("bun signature wins over pnpm if both appear", () => {
        expect(
            detectInstaller("/Users/x/.bun/install/global/node_modules/pnpm-fakery/bin.js"),
        ).toBe("bun");
    });

    test("does not false-positive on a literal 'yarn' folder without /global/", () => {
        expect(
            detectInstaller("/Users/x/projects/yarn/node_modules/@abhinandhajay/prettydiff/bin.js"),
        ).toBe("npm");
    });
});

describe("supportsColor", () => {
    const originalNoColor = process.env.NO_COLOR;
    const originalForceColor = process.env.FORCE_COLOR;

    afterEach(() => {
        if (originalNoColor === undefined) delete process.env.NO_COLOR;
        else process.env.NO_COLOR = originalNoColor;
        if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
        else process.env.FORCE_COLOR = originalForceColor;
    });

    test("false when NO_COLOR is set, regardless of TTY", () => {
        process.env.NO_COLOR = "1";
        delete process.env.FORCE_COLOR;
        expect(supportsColor({ isTTY: true })).toBe(false);
    });

    test("true when FORCE_COLOR is set, regardless of TTY", () => {
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = "1";
        expect(supportsColor({ isTTY: false })).toBe(true);
    });

    test("NO_COLOR wins over FORCE_COLOR", () => {
        process.env.NO_COLOR = "1";
        process.env.FORCE_COLOR = "1";
        expect(supportsColor({ isTTY: true })).toBe(false);
    });

    test("true when stream is a TTY and no env override", () => {
        delete process.env.NO_COLOR;
        delete process.env.FORCE_COLOR;
        expect(supportsColor({ isTTY: true })).toBe(true);
    });

    test("false when stream is not a TTY and no env override", () => {
        delete process.env.NO_COLOR;
        delete process.env.FORCE_COLOR;
        expect(supportsColor({ isTTY: false })).toBe(false);
    });
});

describe("formatUpdateNotice", () => {
    const plain =
        "prettydiff: update available — 0.0.9 → 0.1.0\n  npm install -g @abhinandhajay/prettydiff\n";

    test("returns plain text when color=false", () => {
        expect(formatUpdateNotice("0.0.9", "0.1.0", "npm", { color: false })).toBe(plain);
    });

    test("wraps in yellow ANSI when color=true", () => {
        const out = formatUpdateNotice("0.0.9", "0.1.0", "npm", { color: true });
        expect(out).toBe(`\x1b[33m${plain}\x1b[0m`);
    });

    test("uses the selected installer's command", () => {
        const out = formatUpdateNotice("0.0.9", "0.1.0", "bun", { color: false });
        expect(out).toContain("bun add -g @abhinandhajay/prettydiff");
    });
});

describe("updateCommand", () => {
    test("bun", () => {
        expect(updateCommand("bun")).toBe("bun add -g @abhinandhajay/prettydiff");
    });
    test("pnpm", () => {
        expect(updateCommand("pnpm")).toBe("pnpm add -g @abhinandhajay/prettydiff");
    });
    test("yarn", () => {
        expect(updateCommand("yarn")).toBe("yarn global add @abhinandhajay/prettydiff");
    });
    test("npm", () => {
        expect(updateCommand("npm")).toBe("npm install -g @abhinandhajay/prettydiff");
    });
});

describe("isNewer", () => {
    test("newer patch", () => {
        expect(isNewer("1.0.1", "1.0.0")).toBe(true);
    });
    test("newer minor", () => {
        expect(isNewer("1.1.0", "1.0.9")).toBe(true);
    });
    test("newer major", () => {
        expect(isNewer("2.0.0", "1.99.99")).toBe(true);
    });
    test("equal", () => {
        expect(isNewer("1.2.3", "1.2.3")).toBe(false);
    });
    test("older latest", () => {
        expect(isNewer("1.0.0", "1.0.1")).toBe(false);
    });
    test("malformed latest → false (safe default)", () => {
        expect(isNewer("not-a-version", "1.0.0")).toBe(false);
    });
    test("malformed current → false (safe default)", () => {
        expect(isNewer("1.0.0", "garbage")).toBe(false);
    });
    test("pre-release tag in latest → false (we conservatively skip)", () => {
        expect(isNewer("1.0.0-beta.1", "0.9.0")).toBe(false);
    });
    test("fewer than 3 segments → false", () => {
        expect(isNewer("1.0", "0.9")).toBe(false);
    });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
        ...init,
    });
}

// Bun's `typeof fetch` is a callable plus a `preconnect` namespace member
// (see bun-types/globals.d.ts). Attaching a no-op preconnect lets the stub
// structurally satisfy `typeof fetch` without any casts.
function makeFetchStub(
    impl: (...args: Parameters<typeof fetch>) => Promise<Response>,
): typeof fetch {
    return Object.assign(impl, { preconnect: () => {} });
}

describe("checkForUpdate", () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.PRETTYDIFF_NO_UPDATE_CHECK;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        if (originalEnv === undefined) {
            delete process.env.PRETTYDIFF_NO_UPDATE_CHECK;
        } else {
            process.env.PRETTYDIFF_NO_UPDATE_CHECK = originalEnv;
        }
    });

    test("returns null when opt-out env var is set, without calling fetch", async () => {
        process.env.PRETTYDIFF_NO_UPDATE_CHECK = "1";
        let called = false;
        globalThis.fetch = makeFetchStub(async () => {
            called = true;
            return jsonResponse({ version: "9.9.9" });
        });
        expect(await checkForUpdate("0.0.1")).toBeNull();
        expect(called).toBe(false);
    });

    test("returns latest when registry reports a newer version", async () => {
        globalThis.fetch = makeFetchStub(async () => jsonResponse({ version: "0.2.0" }));
        expect(await checkForUpdate("0.1.0")).toBe("0.2.0");
    });

    test("returns null when registry version equals current", async () => {
        globalThis.fetch = makeFetchStub(async () => jsonResponse({ version: "0.1.0" }));
        expect(await checkForUpdate("0.1.0")).toBeNull();
    });

    test("returns null when registry version is older", async () => {
        globalThis.fetch = makeFetchStub(async () => jsonResponse({ version: "0.0.5" }));
        expect(await checkForUpdate("0.1.0")).toBeNull();
    });

    test("returns null on non-OK response", async () => {
        globalThis.fetch = makeFetchStub(async () => new Response("nope", { status: 500 }));
        expect(await checkForUpdate("0.1.0")).toBeNull();
    });

    test("returns null when response body lacks a version field", async () => {
        globalThis.fetch = makeFetchStub(async () =>
            jsonResponse({ name: "@abhinandhajay/prettydiff" }),
        );
        expect(await checkForUpdate("0.1.0")).toBeNull();
    });

    test("returns null when fetch throws (offline / DNS failure)", async () => {
        globalThis.fetch = makeFetchStub(async () => {
            throw new Error("ENOTFOUND");
        });
        expect(await checkForUpdate("0.1.0")).toBeNull();
    });

    test("requests the correct registry URL", async () => {
        let seenUrl: string | undefined;
        globalThis.fetch = makeFetchStub(async (input) => {
            seenUrl = typeof input === "string" ? input : input.toString();
            return jsonResponse({ version: "0.1.0" });
        });
        await checkForUpdate("0.1.0");
        expect(seenUrl).toBe("https://registry.npmjs.org/%40abhinandhajay%2Fprettydiff/latest");
    });

    test.each(["", "0", "false", "no", "off", "FALSE", " 0 "])(
        "env var set to falsy value %p → check still runs",
        async (value) => {
            process.env.PRETTYDIFF_NO_UPDATE_CHECK = value;
            globalThis.fetch = makeFetchStub(async () => jsonResponse({ version: "9.9.9" }));
            expect(await checkForUpdate("0.1.0")).toBe("9.9.9");
        },
    );
});
