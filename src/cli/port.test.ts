import { describe, expect, test } from "bun:test";
import net from "node:net";

import { candidatePorts, DEFAULT_PORT, findPort } from "./port.js";

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
    test("picks the default port or a fallback candidate by default", async () => {
        const port = await findPort();
        expect(candidatePorts()).toContain(port);
    });

    test("candidate list starts with the default port", () => {
        const ports = candidatePorts();
        expect(ports[0]).toBe(DEFAULT_PORT);
        expect(ports.slice(1)).toEqual(Array.from({ length: 100 }, (_, i) => 39400 + i));
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
