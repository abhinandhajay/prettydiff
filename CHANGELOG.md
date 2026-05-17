# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-17

### Added

- Inline diff comments with edit/delete controls, jump-to-line navigation from a comments sidebar, and one-click AI-ready copy. Includes the surrounding UI polish that shipped with the feature — comments toggle in the header, animated sidebar, "Copied" flash on the copy button, and a unified tint across file and comment cards ([#1](https://github.com/abhinandhajay/prettydiff/pull/1)).
- Startup update check against the npm registry, with an installer-aware upgrade command (bun / pnpm / yarn / npm). Opt out with `PRETTYDIFF_NO_UPDATE_CHECK=1` ([#2](https://github.com/abhinandhajay/prettydiff/pull/2)).
- Reload button — recomputes the working-tree diff on demand without restarting the server.
- Sticky per-file headers while scrolling.
- Line-wrap toggle in the header.
- Calmer overall palette: muted cyan accents, flatter card chrome, ambient gradient that tints every surface.

### Fixed

- `Ctrl-C` now exits cleanly: keep-alive sockets are force-closed on shutdown (previously the server could hang after the first request).

## [0.1.0] - 2026-05-13

### Added

- Initial public release.
- `prettydiff` CLI: detects working-tree changes in any Git repo, starts a local Hono server on a port in `39400-39499`, and opens a browser-based viewer.
- Web viewer (React + Vite): side-by-side and unified diff modes, file-tree sidebar with status indicators and addition/deletion counts, collapsible per-file cards, syntax highlighting.
- Detects modified, added, deleted, renamed, and untracked files.
- Flags: `--port <n>`, `--no-open`, `--version` / `-v`, `--help` / `-h`.

[0.2.0]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.2.0
[0.1.0]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.1.0
