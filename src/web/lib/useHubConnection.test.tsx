import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

import { act, cleanup, renderHook } from "@testing-library/react";

import { useHubConnection } from "./useHubConnection";

const originalFetch = globalThis.fetch;
const browserTimers = window as unknown as {
    setTimeout(callback: () => void, delay?: number): number;
    clearTimeout(id: number | undefined): void;
};
let now = 0;
let nextId = 0;
const timers = new Map<number, { at: number; callback: () => void }>();
let restoreTimers: () => void;
let hubId = "old";
let failing = false;

beforeEach(() => {
    now = 0;
    nextId = 0;
    timers.clear();
    hubId = "old";
    failing = false;
    const set = spyOn(browserTimers, "setTimeout").mockImplementation((callback, delay) => {
        const id = ++nextId;
        timers.set(id, { at: now + (delay ?? 0), callback });
        return id;
    });
    const clear = spyOn(browserTimers, "clearTimeout").mockImplementation((id) => {
        timers.delete(id!);
    });
    restoreTimers = () => {
        set.mockRestore();
        clear.mockRestore();
    };
    globalThis.fetch = (async () => {
        if (failing) throw new Error("hub offline");
        return Response.json({ hubId });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    cleanup();
    restoreTimers();
    globalThis.fetch = originalFetch;
});

async function advance(ms: number) {
    const until = now + ms;
    for (;;) {
        const next = [...timers.entries()]
            .filter(([, timer]) => timer.at <= until)
            .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        await act(async () => next[1].callback());
    }
    now = until;
}

test("expires the reconnect badge after App adopts the replacement hub identity", async () => {
    let changes = 0;
    const { result, rerender, unmount } = renderHook(
        ({ initialHubId }) => useHubConnection(initialHubId, () => changes++),
        { initialProps: { initialHubId: "old" } },
    );
    failing = true;
    await advance(5000);
    expect(result.current).toBe("reconnecting");
    failing = false;
    hubId = "new";
    await advance(1000);
    expect(result.current).toBe("reconnected");
    expect(changes).toBe(1);
    await advance(1000);
    rerender({ initialHubId: "new" });
    await advance(1999);
    expect(result.current).toBe("reconnected");
    await advance(1);
    expect(result.current).toBe("connected");
    await advance(10000);
    expect(result.current).toBe("connected");
    expect(changes).toBe(1);
    unmount();
    expect(timers.size).toBe(0);
});

test("a second outage cancels the old badge and gives recovery a full badge duration", async () => {
    const { result, unmount } = renderHook(() => useHubConnection("old", () => {}));
    failing = true;
    await advance(5000);
    failing = false;
    await advance(1000);
    await advance(1000);
    failing = true;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current).toBe("reconnecting");
    failing = false;
    await advance(1000);
    expect(result.current).toBe("reconnected");
    await advance(2000);
    expect(result.current).toBe("reconnected");
    await advance(1000);
    expect(result.current).toBe("connected");
    unmount();
    expect(timers.size).toBe(0);
});

test("unmount cancels the active reconnect badge and polling timer", async () => {
    const { result, unmount } = renderHook(() => useHubConnection("old", () => {}));
    failing = true;
    await advance(5000);
    failing = false;
    await advance(1000);
    expect(result.current).toBe("reconnected");
    expect(timers.size).toBe(2);
    unmount();
    expect(timers.size).toBe(0);
});
