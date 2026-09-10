# prettydiff

[![npm version](https://img.shields.io/npm/v/@abhinandhajay/prettydiff)](https://www.npmjs.com/package/@abhinandhajay/prettydiff)
[![license](https://img.shields.io/github/license/abhinandhajay/prettydiff)](LICENSE)

A refined local web viewer for your Git changes. Run `prettydiff` inside any Git repository and a browser tab opens with a side-by-side or unified diff of your working tree by default, with controls for previewing what your branch would merge into another branch when you need a broader review.

![prettydiff screenshot](https://zlbhhflgmo.ufs.sh/f/1Dz4wc6RUalTCMEOPGXZNoAMPEtuYClQWdvSfbe4hRGFJDs9)

## Features

- Side-by-side and unified diff views
- Working-tree diff by default, with branch-mode controls in the header
- Branch mode shows everything your current branch would introduce to a selected base branch (local or remote), like a PR diff, with a toggle for including uncommitted and untracked changes
- File-tree sidebar with status indicators and addition/deletion counts
- Inline comments on diff lines with edit/delete controls
- Persistent comments shared between the browser and CLI
- Agent-authored comments with visible attribution
- Comments sidebar with jump-to-line navigation and AI-ready copy
- Reload, line-wrap, and expand/collapse controls
- Detects modified, added, deleted, renamed, and untracked files
- Zero config — runs in any Git repo

## Installation

Requirements: Node `>=18.17` and Git.

```sh
npm install -g @abhinandhajay/prettydiff
```

or with Bun:

```sh
bun add -g @abhinandhajay/prettydiff
```

## Usage

From inside any Git repo with uncommitted changes:

```sh
prettydiff
```

The viewer opens in working-tree mode. Use the header controls to switch to branch mode and choose the base branch — the diff then shows what merging your current branch into that base would introduce. The "+ working tree" toggle controls whether uncommitted and untracked changes are included on top of the committed ones. Branch mode is selected in the web UI, not with a CLI flag.

Options:

| Flag              | Description                                                           |
| ----------------- | --------------------------------------------------------------------- |
| `--port <n>`      | Preferred port (default: `3177`, then auto-selected in `39400-39499`) |
| `--no-open`       | Don't open the browser automatically                                  |
| `--version`, `-v` | Print version and exit                                                |
| `--help`, `-h`    | Print help and exit                                                   |

`Ctrl-C` shuts down the server.

## Shared comment CLI

Agents and scripts can manage the same comments shown in the browser without starting a Pretty Diff server:

```sh
prettydiff comments list
prettydiff comments add --file src/app.ts --side additions --line 42 \
  --body "Handle the rejected promise." --author Codex
prettydiff comments update --id <comment-id> --body "Handle both rejection paths."
prettydiff comments delete --id <comment-id>
```

Commands use the Git repository containing the current directory. They default to the working-tree diff; pass `--target branch --target-ref <ref>` for a branch diff. Successful commands print JSON. Run `prettydiff comments --help` or any command with `--help` for its complete options.

Comments are stored outside the repository in the operating system's application-data directory. Set `PRETTYDIFF_DATA_DIR` to override that location.

## Agent skill

The package includes a concise skill that teaches Codex and Claude how to operate the shared comment CLI:

```sh
prettydiff skill install
```

This installs `prettydiff-cli` for both agents. Pass `--agent codex` or `--agent claude` to install only one copy. Existing copies at the selected destinations are replaced. Run `prettydiff skill install --help` for destination details.

prettydiff prints a one-line update notice on startup when a newer version is on npm. Set `PRETTYDIFF_NO_UPDATE_CHECK=1` to disable.

## Development

Prerequisites: [Bun](https://bun.sh), Node `>=18.17`, Git.

```sh
git clone <repo>
cd prettydiff
bun install
```

Run the web viewer in isolation against the sample fixture (Vite, port 5173, serves `fixtures/sample-diff.json` as `/api/diff`):

```sh
bun run dev
```

Use `?fixture=empty` for the no-changes state and `?fixture=xl` for the large-diff loading path. The XL fixture is a synthetic 53-file, 10k+ line diff; regenerate it with `bun scripts/build-xl-fixture.ts`. The generator is deterministic.

To try the dev build against a real repo, run `bun run build`, then from inside that repo run `node /path/to/prettydiff/dist/cli/bin.js`. This leaves any globally-installed `prettydiff` untouched.

Alternatively, run `bun link` once to put the dev build on your PATH as `prettydiff` — convenient for full-time development, but it shadows any globally-installed version until you `bun unlink @abhinandhajay/prettydiff`.

### Scripts

| Script                 | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `bun run dev`          | Vite dev server for the web viewer with sample fixture |
| `bun run build:web`    | Build the web viewer bundle                            |
| `bun run build`        | Full build: web bundle + CLI compilation               |
| `bun run start`        | Run the compiled CLI (`node dist/cli/bin.js`)          |
| `bun test`             | Run the test suite                                     |
| `bun run lint`         | Run Oxlint                                             |
| `bun run format`       | Format all code with Oxfmt                             |
| `bun run format:check` | Check formatting without writing changes               |

## Project structure

- **`src/cli/`** — Node-side CLI: arg parsing, git ops, Hono server, port discovery, update check
- **`src/web/`** — React + Vite viewer (components, lib, styles)
- **`fixtures/`** — Dev-mode mock payloads served by Vite at `/api/diff` (`sample-diff.json` by default, `sample-diff-empty.json` with `?fixture=empty`, `sample-diff-xl.json` with `?fixture=xl`)
- **`scripts/build-xl-fixture.ts`** — Generator for the XL fixture

## Tech stack

TypeScript · React 19 · Vite 8 · Hono · Tailwind CSS 4 · Shadcn/ui · `@pierre/diffs` · `parse-diff` · `mri` · Oxlint · Oxfmt · Bun.

## License

MIT
