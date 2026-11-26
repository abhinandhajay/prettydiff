import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { cleanupDir, makeTmpDir } from "../../test/helpers/tmpRepo";

import {
    installSkill,
    isSkillInstalled,
    runSkillCommand,
    SKILL_HELP,
    SKILL_INSTALL_HELP,
    SKILL_INSTALL_HINT,
    skillDestinations,
    skillInstallHint,
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

describe("skill install hint", () => {
    test("recommends installing until the skill is installed for an agent", async () => {
        const { root, source, home } = await fixture();
        try {
            expect(await isSkillInstalled(home)).toBe(false);
            expect(await skillInstallHint(home, {})).toBe(SKILL_INSTALL_HINT);
            expect(SKILL_INSTALL_HINT).toContain("prettydiff skill install");

            // An agent being set up is not enough; the skill itself has to be there.
            await mkdir(path.join(home, ".claude", "skills"), { recursive: true });
            expect(await skillInstallHint(home, {})).toBe(SKILL_INSTALL_HINT);

            // Installing for either agent is enough to stop the tip.
            await installSkill(source, skillDestinations(home, "codex")[0]!);
            expect(await isSkillInstalled(home)).toBe(true);
            expect(await skillInstallHint(home, {})).toBeNull();
        } finally {
            await cleanupDir(root);
        }
    });

    test("the hint does not install anything", async () => {
        const { root, home } = await fixture();
        try {
            await mkdir(path.join(home, ".claude"), { recursive: true });
            await skillInstallHint(home, {});
            expect(await isSkillInstalled(home)).toBe(false);
        } finally {
            await cleanupDir(root);
        }
    });

    test("can be hidden", async () => {
        const { root, home } = await fixture();
        try {
            expect(await skillInstallHint(home, { PRETTYDIFF_NO_SKILL_HINT: "1" })).toBeNull();
            expect(await skillInstallHint(home, { PRETTYDIFF_NO_SKILL_HINT: "0" })).toBe(
                SKILL_INSTALL_HINT,
            );
        } finally {
            await cleanupDir(root);
        }
    });
});
