# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-13

### Added

- Initial public release.
- `prettydiff` CLI: detects working-tree changes in any Git repo, starts a local Hono server on a port in `39400-39499`, and opens a browser-based viewer.
- Web viewer (React + Vite): side-by-side and unified diff modes, file-tree sidebar with status indicators and addition/deletion counts, collapsible per-file cards, syntax highlighting.
- Detects modified, added, deleted, renamed, and untracked files.
- Flags: `--port <n>`, `--no-open`, `--version` / `-v`, `--help` / `-h`.

[0.1.0]: https://github.com/abhinandhajay/prettydiff/releases/tag/v0.1.0
