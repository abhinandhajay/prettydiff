import { describe, expect, jest, test } from "bun:test";

import { LazyDiffBody } from "@/components/LazyDiffBody";
import { act, render } from "@testing-library/react";

describe("LazyDiffBody", () => {
    test("reports completion after the rendered body settles", () => {
        jest.useFakeTimers();
        try {
            const onRender = jest.fn();
            const onSettled = jest.fn();
            render(
                <LazyDiffBody estimatedHeight={500} eager onRender={onRender} onSettled={onSettled}>
                    <div>diff</div>
                </LazyDiffBody>,
            );

            act(() => jest.advanceTimersByTime(260));
            expect(onRender).toHaveBeenCalledTimes(1);
            expect(onSettled).not.toHaveBeenCalled();

            act(() => jest.advanceTimersByTime(100));
            expect(onSettled).toHaveBeenCalledTimes(1);

            act(() => jest.advanceTimersByTime(1000));
            expect(onSettled).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });
});
