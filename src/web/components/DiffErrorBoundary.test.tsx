import { describe, expect, mock, spyOn, test } from "bun:test";

import { DiffErrorBoundary } from "@/components/DiffErrorBoundary";
import { render, screen } from "@testing-library/react";

function Thrower(): never {
    throw new Error("render exploded");
}

describe("DiffErrorBoundary", () => {
    test("renders children when nothing throws", () => {
        render(
            <DiffErrorBoundary fallback={<div>fallback</div>}>
                <div>content</div>
            </DiffErrorBoundary>,
        );
        expect(screen.getByText("content")).toBeInTheDocument();
        expect(screen.queryByText("fallback")).not.toBeInTheDocument();
    });

    test("renders the fallback when a child throws", () => {
        const spy = spyOn(console, "error").mockImplementation(() => {});
        const onError = mock();
        try {
            render(
                <DiffErrorBoundary fallback={<div>fallback</div>} onError={onError}>
                    <Thrower />
                </DiffErrorBoundary>,
            );
            expect(screen.getByText("fallback")).toBeInTheDocument();
            expect(onError).toHaveBeenCalledTimes(1);
        } finally {
            spy.mockRestore();
        }
    });
});
