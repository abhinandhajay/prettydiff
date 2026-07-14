import { describe, expect, test } from "bun:test";
import net from "node:net";

import { findPort } from "./port.js";

function listen(port: number): Promise<net.Server> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve(server));
    });
}

function close(server: net.Server): Promise<void> {
    return new Promise((resolve) => server.close(() => resolve()));
}

describe("findPort", () => {
    test("picks a port in the 39400-39499 range by default", async () => {
        const port = await findPort();
        expect(port).toBeGreaterThanOrEqual(39400);
        expect(port).toBeLessThanOrEqual(39499);
    });

    test("falls back to another port when the preferred one is taken", async () => {
        const occupier = await listen(0);
        const taken = (occupier.address() as net.AddressInfo).port;
        try {
            const port = await findPort(taken);
            expect(port).not.toBe(taken);
            expect(port).toBeGreaterThan(0);
        } finally {
            await close(occupier);
        }
    });
});
