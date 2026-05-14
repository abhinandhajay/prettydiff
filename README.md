# prettydiff

A refined local web viewer for your Git working tree changes. Run `prettydiff` inside any Git repository and a browser tab opens with a side-by-side or unified diff of every modified, added, deleted, renamed, and untracked file.

## Features

- Side-by-side and unified diff views
- File-tree sidebar with status indicators and addition/deletion counts
- Collapsible per-file cards
- Detects modified, added, deleted, renamed, and untracked files
- Zero config — runs in any Git repo
- Refined dev-tool aesthetic

## Installation

```sh
npm install -g @abhinandhajay/prettydiff
# or
bun add -g @abhinandhajay/prettydiff
```

Local install from a clone:

```sh
bun install
bun run build
npm link
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

Build everything and run the CLI locally against a real repo:

```sh
bun run build
cd /path/to/some/git/repo
node /path/to/prettydiff/dist/cli/bin.js
```

### Scripts

| Script                 | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `bun run dev`          | Vite dev server for the web viewer with sample fixture      |
| `bun run build`        | Full build: web bundle + CLI compilation                    |
| `bun run build:web`    | Bundle the web viewer to `dist/web/`                        |
| `bun run build:cli`    | Compile the CLI to `dist/cli/` and mark `bin.js` executable |
| `bun run start`        | Run the compiled CLI (`node dist/cli/bin.js`)               |
| `bun run lint`         | Run Oxlint                                                  |
| `bun run lint:fix`     | Run Oxlint with `--fix`                                     |
| `bun run format`       | Format all code with Oxfmt                                  |
| `bun run format:check` | Verify formatting without writing                           |

## Project structure

```
src/
├── cli/                  Node-side CLI
│   ├── bin.ts            Executable entry point
│   ├── main.ts           Arg parsing, orchestration, lifecycle
│   ├── git.ts            Git operations (diff, ls-files, metadata)
│   ├── server.ts         Hono server (serves /api/diff + static viewer)
│   ├── port.ts           Port discovery in 39400-39499
│   └── types.ts          Shared types
└── web/                  React + Vite viewer
    ├── App.tsx           Root component
    ├── main.tsx          React entry
    ├── components/       UI components (Header, FileCard, FileTreeSidebar, …)
    ├── lib/              fetchDiff, types, treeSort, slug, hooks
    └── styles/           Tailwind globals
fixtures/sample-diff.json Dev-mode mock payload
```

## Tech stack

TypeScript · React 19 · Vite 8 · Hono · Tailwind CSS 4 · Shadcn/ui · `@pierre/diffs` · `parse-diff` · `mri` · Oxlint · Oxfmt · Bun.

## License

MIT
