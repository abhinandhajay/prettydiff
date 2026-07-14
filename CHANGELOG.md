# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-07-13

### Added

- Multiple `prettydiff` instances can now share one local server, with a repository switcher in the viewer and a `--standalone` option when an isolated server is preferred.

### Changed

- The CLI now prefers port `3177`, falling back to the existing `39400-39499` range when needed.

## [0.6.0] - 2026-07-02

### Added

- Branch comparisons can now include working-tree changes, with duplicate untracked paths filtered out so the file list stays accurate.
- The review sidebar now combines the file tree and comments into one resizable left panel.

### Changed

- Dependencies were updated to keep the CLI and web viewer current.

### Fixed

- Initial rendering for large diffs now stages diff bodies so the viewer paints reliably, while comment jumps can still target lazily rendered files.

## [0.5.1] - 2026-07-01

### Fixed

- Working trees checked out with CRLF line endings no longer show every line as changed; line endings are normalized so only real edits appear in the diff ([#9](https://github.com/abhinandhajay/prettydiff/pull/9)).

## [0.5.0] - 2026-06-30

### Added

- Branch comparison controls let you choose a target branch and inspect changes against it from the viewer.

## [0.4.0] - 2026-06-29

### Added

- Expandable context: collapsed regions between hunks can now be opened to reveal the surrounding lines, so you can read a change in its full context without leaving the viewer ([#5](https://github.com/abhinandhajay/prettydiff/pull/5)).

### Changed

- Redesigned diff viewer: full-bleed file cards, per-file diff stats in the sidebar, a cleaner top header, and overall theme tuning ([#6](https://github.com/abhinandhajay/prettydiff/pull/6)).
- Inline comments now render as flat diff annotations, and the comments sidebar slides in and out smoothly ([#6](https://github.com/abhinandhajay/prettydiff/pull/6)).
- Reloading now refreshes the file tree alongside the diff.

### Fixed

- Symlinked working-tree files are handled correctly instead of erroring ([#5](https://github.com/abhinandhajay/prettydiff/pull/5)).
- Click-to-scroll from a comment now lands precisely on the target line in multi-file diffs ([#5](https://github.com/abhinandhajay/prettydiff/pull/5)).
- Diffs that span multiple blocks within a single file now reconstruct correctly ([#5](https://github.com/abhinandhajay/prettydiff/pull/5)).

## [0.3.0] - 2026-05-28

### Changed

- Large diffs now render incrementally and stay responsive: file bodies mount lazily via `content-visibility`, stay mounted when a card is collapsed, and a loading hint shows while a very large diff paints. Previously, opening a repo with large diffs could freeze the viewer.
- Jumping to a commented line now scrolls with a smooth velocity-based animation instead of snapping instantly.

### Fixed

- A file whose diff throws while rendering now shows an inline "preview skipped" notice instead of breaking the rest of the viewer.
- Pure renames, mode-only changes, and submodule pointer bumps (diffs with no textual hunks) now show a "no textual changes" placeholder instead of an empty body.

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

[0.7.0]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.7.0
[0.6.0]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.6.0
[0.5.1]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.5.1
[0.5.0]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.5.0
[0.4.0]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.4.0
[0.3.0]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.3.0
[0.2.0]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.2.0
[0.1.0]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.1.0
