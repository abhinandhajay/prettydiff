import { mkdtemp, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function git(args: string[], cwd: string): void {
    const r = Bun.spawnSync(["git", ...args], {
        cwd,
        env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
    });
    if (r.exitCode !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
    }
}

export async function makeGitRepo(prefix = "prettydiff-test-"): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
    git(["init", "-q"], dir);
    git(
        [
            "-c",
            "user.email=test@example.com",
            "-c",
            "user.name=test",
            "commit",
            "--allow-empty",
            "-q",
            "-m",
            "init",
        ],
        dir,
    );
    // os.tmpdir() is a symlink on macOS; match the server's realpath canonicalization
    return realpath(dir);
}
