import mri from "mri";
import open from "open";

import { getDiffPayload, getRepoRoot } from "./git.js";
import { findPort } from "./port.js";
import { startServer } from "./server.js";

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

function parseArgs(argv: string[]): Args {
    const a = mri(argv, {
        boolean: ["help", "version", "open"],
        default: { open: true },
        alias: { h: "help", v: "version" },
    });
    return {
        port: a.port ? Number(a.port) : undefined,
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
    if (args.version) {
        process.stdout.write((await readVersion()) + "\n");
        return 0;
    }

    const cwd = process.cwd();
    const repoRoot = await getRepoRoot(cwd);
    if (!repoRoot) {
        process.stderr.write("prettydiff: not a git repository\n");
        return 1;
    }

    const payload = await getDiffPayload(cwd);
    if (!payload) {
        process.stderr.write("prettydiff: not a git repository\n");
        return 1;
    }
    if (payload.files.length === 0) {
        process.stdout.write("prettydiff: no changes\n");
        return 0;
    }

    const port = await findPort(args.port);
    const server = await startServer(payload, port);

    process.stdout.write(
        `prettydiff: serving ${payload.files.length} file(s) on ${server.url}  (ctrl-c to quit)\n`,
    );

    if (args.open) {
        open(server.url).catch(() => {
            // ignore — the URL is printed above
        });
    }

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
