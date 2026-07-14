import { describe, expect, test } from "bun:test";

import { formatRelativeTime, repoBasename } from "@/lib/format";

const NOW = 1_750_000_000_000;
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
    const cases: Array<[number, string]> = [
        [0, "just now"],
        [44 * SEC, "just now"],
        [45 * SEC, "1m ago"],
        [60 * SEC, "1m ago"],
        [59 * MIN, "59m ago"],
        [60 * MIN, "1h ago"],
        [23 * HOUR, "23h ago"],
        [24 * HOUR, "1d ago"],
        [6 * DAY, "6d ago"],
        [7 * DAY, "1w ago"],
        [34 * DAY, "4w ago"],
        [35 * DAY, "1mo ago"],
        [359 * DAY, "11mo ago"],
        // days 360-364 fall past the last month bucket and round up to a year.
        [360 * DAY, "1y ago"],
        [365 * DAY, "1y ago"],
        [730 * DAY, "2y ago"],
    ];

    test.each(cases)("%i ms ago → %s", (diff, expected) => {
        expect(formatRelativeTime(NOW - diff, NOW)).toBe(expected);
    });

    test("future timestamps clamp to just now", () => {
        expect(formatRelativeTime(NOW + HOUR, NOW)).toBe("just now");
    });
});

describe("repoBasename", () => {
    test.each([
        ["/Users/x/repo", "repo"],
        ["/Users/x/repo/", "repo"],
        ["C:\\Users\\x\\repo", "repo"],
        ["/", ""],
        ["", ""],
    ])("%s → %s", (input, expected) => {
        expect(repoBasename(input)).toBe(expected);
    });
});
