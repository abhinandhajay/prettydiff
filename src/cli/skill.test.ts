import { describe, expect, test } from "bun:test";
import { access, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

import { cleanupDir, makeTmpDir } from "../../test/helpers/tmpRepo";

import {
    autoInstallSkill,
    detectSkillAgents,
    formatAutoInstallNotice,
    installSkill,
    runSkillCommand,
    SKILL_HELP,
    SKILL_INSTALL_HELP,
    skillDestinations,
} from "./skill";

async function fixture() {
    const root = await makeTmpDir();
    const source = path.join(root, "source");
    const home = path.join(root, "home");
    await mkdir(path.join(source, "agents"), { recursive: true });
    await writeFile(path.join(source, "SKILL.md"), "packaged skill\n");
    await writeFile(path.join(source, "agents", "openai.yaml"), "interface: {}\n");
    return { root, source, home };
}

describe("skill install", () => {
    test("the packaged skill teaches CLI operations without a review workflow", async () => {
        const skill = await readFile(
            new URL("../../skills/prettydiff-cli/SKILL.md", import.meta.url),
            "utf8",
        );
        expect(skill).toContain("prettydiff comments add");
        expect(skill).toContain("prettydiff comments list");
        for (const reviewInstruction of [
            "git diff",
            "git status",
            "identify bugs",
            "prioritize findings",
            "run the tests",
        ]) {
            expect(skill.toLowerCase()).not.toContain(reviewInstruction);
        }
    });

    test("maps agent selections to their user skill directories", () => {
        expect(skillDestinations("/home/test", "all")).toEqual([
            "/home/test/.agents/skills/prettydiff-cli",
            "/home/test/.claude/skills/prettydiff-cli",
        ]);
    });

    test("installs all and replaces an existing selected skill", async () => {
        const { root, source, home } = await fixture();
        try {
            let stdout = "";
            expect(
                await runSkillCommand(["install"], {
                    home,
                    source,
                    stdout: (text) => (stdout += text),
                    stderr: () => {},
                }),
            ).toBe(0);
            const result = JSON.parse(stdout);
            expect(result.destinations).toEqual(skillDestinations(home, "all"));
            for (const destination of result.destinations) {
                expect(await readFile(path.join(destination, "SKILL.md"), "utf8")).toBe(
                    "packaged skill\n",
                );
            }

            const codex = skillDestinations(home, "codex")[0]!;
            await writeFile(path.join(codex, "SKILL.md"), "local edit\n");
            await installSkill(source, codex);
            expect(await readFile(path.join(codex, "SKILL.md"), "utf8")).toBe("packaged skill\n");
        } finally {
            await cleanupDir(root);
        }
    });

    test("supports one agent and validates the selection", async () => {
        const { root, source, home } = await fixture();
        try {
            let stdout = "";
            let stderr = "";
            expect(
                await runSkillCommand(["install", "--agent", "claude"], {
                    home,
                    source,
                    stdout: (text) => (stdout += text),
                    stderr: (text) => (stderr += text),
                }),
            ).toBe(0);
            expect(JSON.parse(stdout).destinations).toEqual(skillDestinations(home, "claude"));
            expect(stderr).toBe("");

            const invalid = await runSkillCommand(["install", "--agent", "other"], {
                home,
                source,
                stdout: () => {},
                stderr: (text) => (stderr += text),
            });
            expect(invalid).toBe(2);
            expect(stderr).toContain("--agent must be all, codex, or claude");
        } finally {
            await cleanupDir(root);
        }
    });

    test("prints group and action help", async () => {
        for (const [argv, expected] of [
            [["--help"], SKILL_HELP],
            [["install", "--help"], SKILL_INSTALL_HELP],
        ] as const) {
            let stdout = "";
            expect(
                await runSkillCommand([...argv], {
                    stdout: (text) => (stdout += text),
                    stderr: () => {},
                }),
            ).toBe(0);
            expect(stdout).toBe(expected);
        }
    });
});

describe("skill auto-install", () => {
    async function present(target: string): Promise<boolean> {
        try {
            await access(target);
            return true;
        } catch {
            return false;
        }
    }

    test("installs for detected agents once per version", async () => {
        const { root, source, home } = await fixture();
        const dataDir = path.join(root, "data");
        try {
            await mkdir(path.join(home, ".claude"), { recursive: true });
            await mkdir(path.join(home, ".codex"), { recursive: true });
            const options = { home, dataDir, version: "1.0.0", source, env: {} };

            const first = await autoInstallSkill(options);
            expect(first).toEqual({
                agents: ["Claude Code", "Codex"],
                destinations: [
                    path.join(home, ".claude", "skills", "prettydiff-cli"),
                    path.join(home, ".agents", "skills", "prettydiff-cli"),
                ],
            });
            for (const destination of first!.destinations) {
                expect(await readFile(path.join(destination, "SKILL.md"), "utf8")).toBe(
                    "packaged skill\n",
                );
            }
            expect(formatAutoInstallNotice(first!)).toContain("for Claude Code and Codex");

            // The same version does not reinstall, even if the user removed a copy.
            await writeFile(path.join(source, "SKILL.md"), "updated skill\n");
            expect(await autoInstallSkill(options)).toBeNull();
            expect(
                await readFile(
                    path.join(home, ".claude", "skills", "prettydiff-cli", "SKILL.md"),
                    "utf8",
                ),
            ).toBe("packaged skill\n");

            // An upgrade refreshes the installed copies.
            expect(await autoInstallSkill({ ...options, version: "1.1.0" })).not.toBeNull();
            expect(
                await readFile(
                    path.join(home, ".claude", "skills", "prettydiff-cli", "SKILL.md"),
                    "utf8",
                ),
            ).toBe("updated skill\n");
        } finally {
            await cleanupDir(root);
        }
    });

    test("only installs for agents that are set up", async () => {
        const { root, source, home } = await fixture();
        const dataDir = path.join(root, "data");
        try {
            await mkdir(home, { recursive: true });
            expect(await detectSkillAgents(home)).toEqual([]);
            const options = { home, dataDir, version: "1.0.0", source, env: {} };
            expect(await autoInstallSkill(options)).toBeNull();
            expect(await present(path.join(home, ".claude"))).toBe(false);
            expect(await present(path.join(dataDir, "skill-install.json"))).toBe(false);

            await mkdir(path.join(home, ".agents"), { recursive: true });
            expect(await detectSkillAgents(home)).toEqual(["codex"]);
            const installed = await autoInstallSkill(options);
            expect(installed?.agents).toEqual(["Codex"]);
            expect(await present(path.join(home, ".claude"))).toBe(false);
        } finally {
            await cleanupDir(root);
        }
    });

    test("viewers starting at once install the skill only once", async () => {
        const { root, source, home } = await fixture();
        const dataDir = path.join(root, "data");
        try {
            await mkdir(path.join(home, ".claude"), { recursive: true });
            const options = { home, dataDir, version: "1.0.0", source, env: {} };
            const results = await Promise.all(
                Array.from({ length: 4 }, () => autoInstallSkill(options)),
            );
            expect(results.filter(Boolean)).toHaveLength(1);
            expect(
                await readFile(
                    path.join(home, ".claude", "skills", "prettydiff-cli", "SKILL.md"),
                    "utf8",
                ),
            ).toBe("packaged skill\n");
            expect(await present(path.join(dataDir, "skill-install.lock"))).toBe(false);
            expect(await autoInstallSkill(options)).toBeNull();
        } finally {
            await cleanupDir(root);
        }
    });

    test("waits for a live lock and clears a stale one", async () => {
        const { root, source, home } = await fixture();
        const dataDir = path.join(root, "data");
        const lock = path.join(dataDir, "skill-install.lock");
        try {
            await mkdir(path.join(home, ".claude"), { recursive: true });
            await mkdir(dataDir, { recursive: true });
            const options = { home, dataDir, version: "1.0.0", source, env: {} };

            // Another viewer is installing: leave it to that one.
            await writeFile(lock, "123");
            expect(await autoInstallSkill(options)).toBeNull();
            expect(await present(path.join(home, ".claude", "skills"))).toBe(false);

            // A lock left by a viewer that died long ago does not block the install forever.
            const old = new Date(Date.now() - 10 * 60_000);
            await utimes(lock, old, old);
            expect((await autoInstallSkill(options))?.agents).toEqual(["Claude Code"]);
            expect(await present(lock)).toBe(false);
        } finally {
            await cleanupDir(root);
        }
    });

    test("can be turned off", async () => {
        const { root, source, home } = await fixture();
        try {
            await mkdir(path.join(home, ".claude"), { recursive: true });
            const result = await autoInstallSkill({
                home,
                dataDir: path.join(root, "data"),
                version: "1.0.0",
                source,
                env: { PRETTYDIFF_NO_SKILL_INSTALL: "1" },
            });
            expect(result).toBeNull();
            expect(await present(path.join(home, ".claude", "skills"))).toBe(false);
        } finally {
            await cleanupDir(root);
        }
    });
});
