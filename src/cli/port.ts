import getPort, { portNumbers } from "get-port";

export async function findPort(preferred?: number): Promise<number> {
    if (preferred) {
        return getPort({ port: preferred });
    }
    return getPort({ port: portNumbers(39400, 39499) });
}
