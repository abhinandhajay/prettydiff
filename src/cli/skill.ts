import { cp, mkdir, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mri from "mri";

export const SKILL_HELP = `prettydiff skill — install the packaged agent skill

Usage:
  prettydiff skill <command> [options]

Commands:
  install    Install the prettydiff-cli skill for Codex, Claude, or both

Run "prettydiff skill install --help" for installation options.
`;

export const SKILL_INSTALL_HELP = `prettydiff skill install — install the packaged prettydiff-cli skill

Usage:
  prettydiff skill install [--agent <agent>]

Options:
  --agent <agent>    all (default), codex, or claude
  --help             Print this help and exit

Destinations:
  Codex     $HOME/.agents/skills/prettydiff-cli
  Claude    $HOME/.claude/skills/prettydiff-cli

Existing prettydiff-cli skill directories at the selected destinations are replaced.

Example:
  prettydiff skill install --agent codex
`;

export type SkillAgent = "all" | "codex" | "claude";

interface SkillIo {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    home?: string;
    source?: string;
}

function bundledSkillPath(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(here, "..", "..", "skills", "prettydiff-cli");
}

export function skillDestinations(home: string, agent: SkillAgent): string[] {
    const destinations = {
        codex: path.join(home, ".agents", "skills", "prettydiff-cli"),
        claude: path.join(home, ".claude", "skills", "prettydiff-cli"),
    };
    return agent === "all" ? [destinations.codex, destinations.claude] : [destinations[agent]];
}

export async function installSkill(source: string, destination: string): Promise<void> {
    const parent = path.dirname(destination);
    await mkdir(parent, { recursive: true });
    const nonce = `${process.pid}-${crypto.randomUUID()}`;
    const staged = path.join(parent, `.prettydiff-cli.install-${nonce}`);
    const previous = path.join(parent, `.prettydiff-cli.previous-${nonce}`);
    await cp(source, staged, { recursive: true, errorOnExist: true });
    let movedPrevious = false;
    try {
        try {
            await rename(destination, previous);
            movedPrevious = true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        await rename(staged, destination);
        if (movedPrevious) await rm(previous, { recursive: true, force: true });
    } catch (error) {
        await rm(staged, { recursive: true, force: true });
        if (movedPrevious) {
            await rm(destination, { recursive: true, force: true });
            await rename(previous, destination);
        }
        throw error;
    }
}

export async function runSkillCommand(argv: string[], io: SkillIo): Promise<number> {
    const command = argv[0];
    if (!command || command === "--help" || command === "-h") {
        io.stdout(SKILL_HELP);
        return 0;
    }
    if (command !== "install") {
        io.stderr(
            `prettydiff: unknown skill command: ${command}\nRun "prettydiff skill --help" for usage.\n`,
        );
        return 2;
    }
    const unknown = argv.slice(1).find((arg) => {
        if (!arg.startsWith("--")) return false;
        const name = arg.slice(2).split("=", 1)[0];
        return name !== "agent" && name !== "help";
    });
    if (unknown) {
        io.stderr(
            `prettydiff: unknown option for skill install: ${unknown}\nRun "prettydiff skill install --help" for usage.\n`,
        );
        return 2;
    }
    const args = mri(argv.slice(1), {
        boolean: ["help"],
        string: ["agent"],
        default: { agent: "all" },
        alias: { h: "help" },
    });
    if (args.help) {
        io.stdout(SKILL_INSTALL_HELP);
        return 0;
    }
    if (args._.length) {
        io.stderr(
            `prettydiff: unexpected argument: ${args._[0]}\nRun "prettydiff skill install --help" for usage.\n`,
        );
        return 2;
    }
    if (args.agent !== "all" && args.agent !== "codex" && args.agent !== "claude") {
        io.stderr(
            `prettydiff: --agent must be all, codex, or claude\nRun "prettydiff skill install --help" for usage.\n`,
        );
        return 2;
    }

    try {
        const destinations = skillDestinations(io.home ?? os.homedir(), args.agent);
        for (const destination of destinations) {
            await installSkill(io.source ?? bundledSkillPath(), destination);
        }
        io.stdout(
            JSON.stringify({ skill: "prettydiff-cli", agent: args.agent, destinations }, null, 2) +
                "\n",
        );
        return 0;
    } catch (error) {
        io.stderr(`prettydiff: could not install skill: ${(error as Error).message}\n`);
        return 1;
    }
}
