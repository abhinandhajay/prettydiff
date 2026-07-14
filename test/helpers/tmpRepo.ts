import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function runGit(cwd: string, ...args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
        child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) resolve(stdout.trim());
            else reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr || stdout}`));
        });
    });
}

export function makeTmpDir(): Promise<string> {
    return mkdtemp(path.join(os.tmpdir(), "prettydiff-test-"));
}

// Local config keeps repos hermetic against the developer's global gitconfig
// (signing, default branch, autocrlf).
export async function makeRepo(): Promise<string> {
    const dir = await makeTmpDir();
    await runGit(dir, "init", "-b", "main");
    await runGit(dir, "config", "user.email", "test@example.com");
    await runGit(dir, "config", "user.name", "Test");
    await runGit(dir, "config", "commit.gpgsign", "false");
    await runGit(dir, "config", "core.autocrlf", "false");
    return dir;
}

export async function writeRepoFile(
    dir: string,
    relPath: string,
    contents: string | Uint8Array,
): Promise<void> {
    const abs = path.join(dir, relPath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, contents);
}

export async function commitFile(
    dir: string,
    relPath: string,
    contents: string | Uint8Array,
    message = `add ${relPath}`,
): Promise<void> {
    await writeRepoFile(dir, relPath, contents);
    await runGit(dir, "add", relPath);
    await runGit(dir, "commit", "-m", message);
}

export function cleanupDir(dir: string): Promise<void> {
    return rm(dir, { recursive: true, force: true });
}
