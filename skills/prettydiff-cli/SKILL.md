---
name: prettydiff-cli
description: Operate the Pretty Diff CLI for comments shared with its local browser viewer. Use when asked to list, add, update, delete, or verify Pretty Diff comments, choose a working-tree or branch comment target, or install and discover Pretty Diff CLI features. Do not use as a general code-review procedure.
---

# Pretty Diff CLI

Confirm `prettydiff` is available with `prettydiff --version`. Use `prettydiff --help` and contextual command help whenever an option is unclear.

## Comments

List comments for the working-tree diff:

```sh
prettydiff comments list
```

Use `--target branch --target-ref <ref>` to select a branch diff. Add `--no-include-working-tree` to exclude uncommitted changes from that branch target.

Add a comment with a repository-relative file, diff side, one-based line number, and body:

```sh
prettydiff comments add --file <path> --side <additions|deletions> --line <number> --body <text> --author <name>
```

Pass `--author Codex` when running as Codex and `--author Claude` when running as Claude.

Update or delete a comment using the ID returned by `list` or `add`:

```sh
prettydiff comments update --id <comment-id> --body <text>
prettydiff comments delete --id <comment-id>
```

Run the matching command with `--help` for its complete options and output contract. Successful comment commands write one JSON document to stdout. Usage errors exit `2`; repository, validation, and storage errors exit `1`.

After adding, updating, or deleting a comment, run `prettydiff comments list` with the same target options to verify the stored result.
