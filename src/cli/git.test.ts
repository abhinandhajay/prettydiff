import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { getDiffPayload } from "./git.js";

const repos: string[] = [];

function git(cwd: string, args: string[]) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
}

async function makeRepo() {
    const repo = await mkdtemp(path.join(tmpdir(), "prettydiff-git-"));
    repos.push(repo);
    git(repo, ["init", "-b", "main"]);
    git(repo, ["config", "user.email", "prettydiff@example.test"]);
    git(repo, ["config", "user.name", "Pretty Diff"]);
    return repo;
}

afterEach(async () => {
    await Promise.all(repos.splice(0).map((repo) => rm(repo, { recursive: true, force: true })));
});

describe("getDiffPayload", () => {
    test("does not append untracked patches for paths already present in a branch diff", async () => {
        const repo = await makeRepo();
        await writeFile(path.join(repo, "f"), "base\n");
        git(repo, ["add", "f"]);
        git(repo, ["commit", "-m", "base"]);
        git(repo, ["checkout", "-b", "feature"]);
        git(repo, ["rm", "f"]);
        git(repo, ["commit", "-m", "delete f"]);
        await writeFile(path.join(repo, "f"), "local recreation\n");

        const payload = await getDiffPayload(repo, { target: "branch", targetRef: "main" });

        expect(payload?.files.map((file) => ({ path: file.path, status: file.status }))).toEqual([
            { path: "f", status: "deleted" },
        ]);
    });
});
