import { beforeEach, describe, expect, test } from "bun:test";

import { usePersistedState } from "@/lib/usePersistedState";
import { act, renderHook } from "@testing-library/react";

const KEY = "prettydiff:test";

beforeEach(() => {
    localStorage.clear();
});

describe("usePersistedState", () => {
    test("returns the initial value when nothing is stored", () => {
        const { result } = renderHook(() => usePersistedState(KEY, "fallback"));
        expect(result.current[0]).toBe("fallback");
    });

    test("reads a previously stored value", () => {
        localStorage.setItem(KEY, JSON.stringify("stored"));
        const { result } = renderHook(() => usePersistedState(KEY, "fallback"));
        expect(result.current[0]).toBe("stored");
    });

    test("persists updates and re-renders", () => {
        const { result } = renderHook(() => usePersistedState(KEY, "initial"));
        act(() => result.current[1]("next"));
        expect(result.current[0]).toBe("next");
        expect(localStorage.getItem(KEY)).toBe(JSON.stringify("next"));
    });

    test("falls back to the initial value on malformed JSON", () => {
        localStorage.setItem(KEY, "{not json");
        const { result } = renderHook(() => usePersistedState(KEY, "fallback"));
        expect(result.current[0]).toBe("fallback");
    });
});
