## What this is

A Bun-based CLI (`prettydiff`) that detects working-tree changes in any Git repo, starts a local Hono server on port `3177` (falling back to `39400-39499`), and serves a React + Vite web viewer with side-by-side / unified diff rendering. The CLI and the web viewer share TypeScript types and live in the same repo.

## Things to know

- **Dev fixtures** — `fixtures/sample-diff.json` is the default payload served at `/api/diff`; use `?fixture=empty` for the no-changes state and `?fixture=xl` for the large-diff loading path.
- **Running app** — for UI work, assume the Vite dev server is usually already running on `http://localhost:5173/`. Verify in the browser against that server instead of starting a new one.

## Testing / verification

- For web changes, run `bun run build:web`, `bun test`, and `bun run format:check` unless the task calls for a narrower check.
- For browser verification, open the already-running app at `http://localhost:5173/`. Use `?fixture=empty` to check the centered no-changes state and `?fixture=xl` to exercise the large-diff loading path.
- If the browser check fails because the dev server is unavailable, report that clearly; don't start `bun run dev`, `vite`, or `bunx vite` yourself.

## Conventions

- **Comments** — the existing code is comment-light. Only add a comment when the _why_ is non-obvious.

## Don'ts / pitfalls

- **Never auto-run `bun run dev`.** The dev server is assumed to be already running. Don't start `vite`/`bunx vite`/equivalents either.
- Don't fork shared types — extend `src/cli/types.ts` and re-export through `src/web/lib/types.ts`.
- Don't introduce CommonJS modules or `require()` — the project is ESM.
- Don't add new dependencies casually; the stack is intentionally small.
- Don't bypass the formatter by hand-aligning — the Stop hook will overwrite.
- Don't use `npm`/`pnpm`/`yarn` in scripts or instructions.
