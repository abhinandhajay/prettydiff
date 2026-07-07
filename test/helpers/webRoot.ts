import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { makeTmpDir } from "./tmpRepo";

export const SPA_MARKER = "<!-- test-spa -->";

export async function makeWebRoot(): Promise<string> {
    const dir = await makeTmpDir();
    await writeFile(
        path.join(dir, "index.html"),
        `<!doctype html><html><body>${SPA_MARKER}</body></html>`,
    );
    await mkdir(path.join(dir, "assets"), { recursive: true });
    await writeFile(path.join(dir, "assets", "app.js"), 'console.log("ok");\n');
    return dir;
}
