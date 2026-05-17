import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "@abhinandhajay/prettydiff";
const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;
const TIMEOUT_MS = 1500;

export type Installer = "bun" | "pnpm" | "yarn" | "npm";

export async function checkForUpdate(currentVersion: string): Promise<string | null> {
    if (isEnvTrue(process.env.PRETTYDIFF_NO_UPDATE_CHECK)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(REGISTRY_URL, { signal: controller.signal });
        if (!res.ok) return null;
        const body = (await res.json()) as { version?: unknown };
        const latest = typeof body.version === "string" ? body.version : null;
        if (!latest) return null;
        return isNewer(latest, currentVersion) ? latest : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export function detectInstaller(modulePath: string = fileURLToPath(import.meta.url)): Installer {
    const p = modulePath.replace(/\\/g, "/");
    if (p.includes("/.bun/install/")) return "bun";
    if (p.includes("/pnpm/")) return "pnpm";
    if (p.includes("/yarn/global/") || p.includes("/.config/yarn/")) return "yarn";
    return "npm";
}

export function updateCommand(installer: Installer): string {
    switch (installer) {
        case "bun":
            return `bun add -g ${PACKAGE_NAME}`;
        case "pnpm":
            return `pnpm add -g ${PACKAGE_NAME}`;
        case "yarn":
            return `yarn global add ${PACKAGE_NAME}`;
        case "npm":
            return `npm install -g ${PACKAGE_NAME}`;
    }
}

export function supportsColor(stream: { isTTY?: boolean } = process.stdout): boolean {
    if (process.env.NO_COLOR) return false;
    if (process.env.FORCE_COLOR) return true;
    return stream.isTTY === true;
}

export function formatUpdateNotice(
    current: string,
    latest: string,
    installer: Installer,
    options: { color?: boolean } = {},
): string {
    const body = `prettydiff: update available — ${current} → ${latest}\n  ${updateCommand(installer)}\n`;
    const useColor = options.color ?? supportsColor();
    return useColor ? `\x1b[33m${body}\x1b[0m` : body;
}

export function isNewer(latest: string, current: string): boolean {
    const a = parseVersion(latest);
    const b = parseVersion(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
    }
    return false;
}

function isEnvTrue(value: string | undefined): boolean {
    if (!value) return false;
    const v = value.trim().toLowerCase();
    return v !== "" && v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

function parseVersion(v: string): [number, number, number] | null {
    const parts = v.split(".");
    if (parts.length < 3) return null;
    const nums: number[] = [];
    for (let i = 0; i < 3; i++) {
        if (!/^\d+$/.test(parts[i])) return null;
        nums.push(Number.parseInt(parts[i], 10));
    }
    return [nums[0], nums[1], nums[2]];
}
