# prettydiff

[![npm version](https://img.shields.io/npm/v/@abhinandhajay/prettydiff)](https://www.npmjs.com/package/@abhinandhajay/prettydiff)
[![license](https://img.shields.io/github/license/abhinandhajay/prettydiff)](LICENSE)

A refined local web viewer for your Git working tree changes. Run `prettydiff` inside any Git repository and a browser tab opens with a side-by-side or unified diff of every modified, added, deleted, renamed, and untracked file.

![prettydiff screenshot](https://utfs.io/f/1Dz4wc6RUalTe5pGJrWwg7NTJVO6bYFZ5mx9d2sPEQcXKu0I)

## Features

- Side-by-side and unified diff views
- File-tree sidebar with status indicators and addition/deletion counts
- Inline comments on diff lines with edit/delete controls
- Comments sidebar with jump-to-line navigation and AI-ready copy
- Collapsible per-file cards
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

Options:

| Flag              | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `--port <n>`      | Preferred port (default: auto-selected in `39400-39499`) |
| `--no-open`       | Don't open the browser automatically                     |
| `--version`, `-v` | Print version and exit                                   |
| `--help`, `-h`    | Print help and exit                                      |

`Ctrl-C` shuts down the server.

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

To try the dev build against a real repo, run `bun run build`, then from inside that repo run `node /path/to/prettydiff/dist/cli/bin.js`. This leaves any globally-installed `prettydiff` untouched.

Alternatively, run `bun link` once to put the dev build on your PATH as `prettydiff` — convenient for full-time development, but it shadows any globally-installed version until you `bun unlink @abhinandhajay/prettydiff`.

### Scripts

| Script           | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `bun run dev`    | Vite dev server for the web viewer with sample fixture |
| `bun run build`  | Full build: web bundle + CLI compilation               |
| `bun run start`  | Run the compiled CLI (`node dist/cli/bin.js`)          |
| `bun test`       | Run the test suite                                     |
| `bun run lint`   | Run Oxlint                                             |
| `bun run format` | Format all code with Oxfmt                             |

## Project structure

- **`src/cli/`** — Node-side CLI: arg parsing, git ops, Hono server, port discovery, update check
- **`src/web/`** — React + Vite viewer (components, lib, styles)
- **`fixtures/sample-diff.json`** — Dev-mode mock payload served by Vite at `/api/diff`

## Tech stack

TypeScript · React 19 · Vite 8 · Hono · Tailwind CSS 4 · Shadcn/ui · `@pierre/diffs` · `parse-diff` · `mri` · Oxlint · Oxfmt · Bun.

## License

MIT
