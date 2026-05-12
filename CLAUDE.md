## What this is

A Bun-based CLI (`prettydiff`) that detects working-tree changes in any Git repo, starts a local Hono server on a port in `39400-39499`, and serves a React + Vite web viewer with side-by-side / unified diff rendering. The CLI and the web viewer share TypeScript types and live in the same repo.

## Things to know

- **Dev fixture** — `fixtures/sample-diff.json`. Vite middleware serves it at `/api/diff` so the web viewer can run without the CLI.

## Conventions

- **Comments** — the existing code is comment-light. Only add a comment when the _why_ is non-obvious.

## Don'ts / pitfalls

- **Never auto-run `bun run dev`.** The dev server is assumed to be already running. Don't start `vite`/`bunx vite`/equivalents either.
- Don't fork shared types — extend `src/cli/types.ts` and re-export through `src/web/lib/types.ts`.
- Don't introduce CommonJS modules or `require()` — the project is ESM.
- Don't add new dependencies casually; the stack is intentionally small.
- Don't bypass the formatter by hand-aligning — the Stop hook will overwrite.
- Don't use `npm`/`pnpm`/`yarn` in scripts or instructions.
