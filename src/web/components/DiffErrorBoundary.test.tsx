import { describe, expect, spyOn, test } from "bun:test";

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
        try {
            render(
                <DiffErrorBoundary fallback={<div>fallback</div>}>
                    <Thrower />
                </DiffErrorBoundary>,
            );
            expect(screen.getByText("fallback")).toBeInTheDocument();
        } finally {
            spy.mockRestore();
        }
    });
});
