import getPort, { portNumbers } from "get-port";

export const DEFAULT_PORT = 3177;
export const FALLBACK_PORT_START = 39400;
export const FALLBACK_PORT_END = 39499;

// The default port followed by the fallback range, in priority order. Binding
// (findPort) and hub discovery (discoverHub) must always scan the same list.
export function candidatePorts(): number[] {
    return [DEFAULT_PORT, ...portNumbers(FALLBACK_PORT_START, FALLBACK_PORT_END)];
}

export async function findPort(preferred?: number): Promise<number> {
    if (preferred) {
        return getPort({ port: preferred });
    }
    return getPort({ port: candidatePorts() });
}
