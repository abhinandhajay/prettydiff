import mri from "mri";
import open from "open";

import { getRepoRoot } from "./git.js";
import { findPort } from "./port.js";
import { startServer } from "./server.js";
import { checkForUpdate, detectInstaller, formatUpdateNotice } from "./update.js";

const HELP = `prettydiff — open the working-tree diff of any git repo in a local web viewer

Usage:
  prettydiff [options]

Options:
  --port <n>     Preferred port (default: auto in 39400-39499)
  --no-open      Do not open the browser automatically
  --version      Print version and exit
  --help         Print this help and exit
`;

interface Args {
    port?: number;
    open: boolean;
    version: boolean;
    help: boolean;
}

export function parseArgs(argv: string[]): Args {
    const a = mri(argv, {
        boolean: ["help", "version", "open"],
        default: { open: true },
        alias: { h: "help", v: "version" },
    });
    const port = Number(a.port);
    return {
        port: a.port && Number.isFinite(port) ? port : undefined,
        open: a.open !== false,
        version: !!a.version,
        help: !!a.help,
    };
}

async function readVersion(): Promise<string> {
    try {
        const url = new URL("../../package.json", import.meta.url);
        const text = await (await import("node:fs/promises")).readFile(url, "utf8");
        return JSON.parse(text).version ?? "0.0.0";
    } catch {
        return "0.0.0";
    }
}

export async function main(argv: string[]): Promise<number> {
    const args = parseArgs(argv);
    if (args.help) {
        process.stdout.write(HELP);
        return 0;
    }
    const version = await readVersion();
    if (args.version) {
        process.stdout.write(version + "\n");
        return 0;
    }

    const repoRoot = await getRepoRoot(process.cwd());
    if (!repoRoot) {
        process.stderr.write("prettydiff: not a git repository\n");
        return 1;
    }

    const port = await findPort(args.port);
    const server = await startServer(repoRoot, port);

    process.stdout.write(`prettydiff: serving on ${server.url}  (ctrl-c to quit)\n`);

    if (args.open) {
        open(server.url).catch(() => {
            // ignore — the URL is printed above
        });
    }

    checkForUpdate(version)
        .then((latest) => {
            if (!latest) return;
            process.stdout.write(formatUpdateNotice(version, latest, detectInstaller()));
        })
        .catch(() => {
            // ignore — update check is best-effort
        });

    await new Promise<void>((resolve) => {
        let shuttingDown = false;
        const shutdown = async () => {
            if (shuttingDown) return;
            shuttingDown = true;
            await server.close();
            resolve();
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
    });

    return 0;
}
