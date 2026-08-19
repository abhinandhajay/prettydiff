import mri from "mri";
import open from "open";

import { runCommentsCommand } from "./comments.js";
import { canonicalRepoRoot } from "./git.js";
import { startInstance } from "./hubClient.js";
import { findPort } from "./port.js";
import { HubRegistry } from "./registry.js";
import { startServer } from "./server.js";
import { runSkillCommand } from "./skill.js";
import { checkForUpdate, detectInstaller, formatUpdateNotice } from "./update.js";

export const HELP = `prettydiff — view Git changes and share review comments

Usage:
  prettydiff [viewer options]
  prettydiff comments <command> [options]
  prettydiff skill install [options]

Commands:
  comments       List, add, update, or delete shared comments
  skill install  Install the packaged prettydiff-cli agent skill

Viewer options:
  --port <n>     Preferred port (default: 3177, then auto-selected)
  --no-open      Do not open the browser automatically
  --standalone   Start a separate server instead of attaching to a running one
  --version, -v  Print version and exit
  --help, -h     Print this help and exit

Examples:
  prettydiff
  prettydiff comments list
  prettydiff comments add --help
  prettydiff skill install --agent all

Run "prettydiff comments --help" or "prettydiff skill --help" for more details.
`;

interface Args {
    port?: number;
    open: boolean;
    standalone: boolean;
    version: boolean;
    help: boolean;
}

interface MainOptions {
    cwd?: string;
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
}

export function parseArgs(argv: string[]): Args {
    const a = mri(argv, {
        boolean: ["help", "version", "open", "standalone"],
        default: { open: true },
        alias: { h: "help", v: "version" },
    });
    const port = Number(a.port);
    return {
        port: a.port && Number.isFinite(port) ? port : undefined,
        open: a.open !== false,
        standalone: !!a.standalone,
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

export async function main(argv: string[], options: MainOptions = {}): Promise<number> {
    const stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
    const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
    const cwd = options.cwd ?? process.cwd();
    const command = argv[0];

    if (command === "comments") {
        return runCommentsCommand(argv.slice(1), { cwd, stdout, stderr });
    }
    if (command === "skill") {
        return runSkillCommand(argv.slice(1), { stdout, stderr });
    }
    if (command && !command.startsWith("-")) {
        stderr(`prettydiff: unknown command: ${command}\nRun "prettydiff --help" for usage.\n`);
        return 2;
    }

    const args = parseArgs(argv);
    if (args.help) {
        stdout(HELP);
        return 0;
    }
    const version = await readVersion();
    if (args.version) {
        stdout(version + "\n");
        return 0;
    }

    const repoRoot = await canonicalRepoRoot(cwd);
    if (!repoRoot) {
        stderr("prettydiff: not a git repository\n");
        return 1;
    }

    const clientId = crypto.randomUUID();
    const instance = await startInstance({
        repoRoot,
        clientId,
        version,
        preferredPort: args.port,
        standalone: args.standalone,
        startHubServer: (port) => {
            const registry = new HubRegistry();
            registry.register(repoRoot, clientId, { isHub: true });
            return startServer({ port, version, hubId: crypto.randomUUID(), registry });
        },
        findFreePort: findPort,
        log: (message) => stdout(message + "\n"),
    });

    if (instance.mode === "hub") {
        stdout(`prettydiff: serving on ${instance.url}  (ctrl-c to quit)\n`);
    } else {
        stdout(`prettydiff: attached to running server — ${instance.url}  (ctrl-c to detach)\n`);
    }

    if (args.open) {
        open(instance.url).catch(() => {
            // ignore — the URL is printed above
        });
    }

    checkForUpdate(version)
        .then((latest) => {
            if (!latest) return;
            stdout(formatUpdateNotice(version, latest, detectInstaller()));
        })
        .catch(() => {
            // ignore — update check is best-effort
        });

    await new Promise<void>((resolve) => {
        let shuttingDown = false;
        const shutdown = async () => {
            if (shuttingDown) return;
            shuttingDown = true;
            await instance.stop();
            resolve();
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
    });

    return 0;
}
