import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mri from "mri";

import { isEnvTrue } from "./update.js";

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

export interface AutoInstallOptions {
    home: string;
    dataDir: string;
    version: string;
    source?: string;
    env?: NodeJS.ProcessEnv;
}

export interface AutoInstallResult {
    agents: string[];
    destinations: string[];
}

const AGENT_LABELS: Record<Exclude<SkillAgent, "all">, string> = {
    claude: "Claude Code",
    codex: "Codex",
};

async function exists(target: string): Promise<boolean> {
    try {
        await stat(target);
        return true;
    } catch {
        return false;
    }
}

/** Agents whose home directories exist, so prettydiff only installs where an agent is set up. */
export async function detectSkillAgents(home: string): Promise<Exclude<SkillAgent, "all">[]> {
    const agents: Exclude<SkillAgent, "all">[] = [];
    if (await exists(path.join(home, ".claude"))) agents.push("claude");
    if ((await exists(path.join(home, ".codex"))) || (await exists(path.join(home, ".agents")))) {
        agents.push("codex");
    }
    return agents;
}

/**
 * Installs the packaged skill for detected agents the first time a prettydiff version runs, and
 * again after an upgrade. Returns what it installed, or null when nothing needed installing.
 */
export async function autoInstallSkill(
    options: AutoInstallOptions,
): Promise<AutoInstallResult | null> {
    const env = options.env ?? process.env;
    if (isEnvTrue(env.PRETTYDIFF_NO_SKILL_INSTALL)) return null;
    const marker = path.join(options.dataDir, "skill-install.json");
    try {
        const recorded = JSON.parse(await readFile(marker, "utf8")) as { version?: unknown };
        if (recorded.version === options.version) return null;
    } catch {
        // No marker yet, or unreadable: install below.
    }
    const agents = await detectSkillAgents(options.home);
    if (!agents.length) return null;
    const destinations = agents.flatMap((agent) => skillDestinations(options.home, agent));
    for (const destination of destinations) {
        await installSkill(options.source ?? bundledSkillPath(), destination);
    }
    await mkdir(options.dataDir, { recursive: true });
    await writeFile(
        marker,
        JSON.stringify({ version: options.version, agents, destinations }, null, 2) + "\n",
    );
    return { agents: agents.map((agent) => AGENT_LABELS[agent]), destinations };
}

export function formatAutoInstallNotice(result: AutoInstallResult): string {
    return `prettydiff: installed the prettydiff-cli agent skill for ${result.agents.join(" and ")} (set PRETTYDIFF_NO_SKILL_INSTALL=1 to skip)\n`;
}
