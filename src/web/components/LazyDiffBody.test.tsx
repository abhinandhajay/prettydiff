import { describe, expect, jest, test } from "bun:test";

import { LazyDiffBody } from "@/components/LazyDiffBody";
import { act, render } from "@testing-library/react";

describe("LazyDiffBody", () => {
    test("reports completion after the rendered body settles", async () => {
        const onRender = jest.fn();
        const onSettled = jest.fn();
        render(
            <LazyDiffBody estimatedHeight={500} eager onRender={onRender} onSettled={onSettled}>
                <div>diff</div>
            </LazyDiffBody>,
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 330));
        });
        expect(onRender).toHaveBeenCalledTimes(1);
        expect(onSettled).not.toHaveBeenCalled();

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
        });
        expect(onSettled).toHaveBeenCalledTimes(1);

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
        });
        expect(onSettled).toHaveBeenCalledTimes(1);
    });
});
