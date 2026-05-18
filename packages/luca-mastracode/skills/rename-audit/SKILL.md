---
name: rename-audit
description: >
  Find stale references across the repo after renaming a file, mode, export, symbol,
  ticket ID, or convention. Searches .md/.ts/.tsx/.mjs/.json/.jsonl, plus commands/,
  todos/, ROADMAP.md, .changeset/, planning artifacts. Read-only audit — never edits
  files. Use when the user says "rename audit", "audit renames", "find stale refs",
  "post-rename check", or invokes /rename-audit.
---

# Skill: rename-audit

Read-only audit for stale references after a rename. Surfaces every file that still
mentions the old name so the caller can decide whether to edit or leave it (e.g.
historical changesets are typically left alone).

## Step 1 — Parse Arguments

Required: `oldName` (the string being phased out), `newName` (its replacement).
Optional: `scope` (`mode` | `file` | `export` | `symbol` | `ticket` | `convention`)
to refine the search. Optional: `extraExtensions` (e.g. `['.yaml']`) to widen scope.

If args missing, prompt the user once with `ask_user`. Reject if `oldName === newName`.

## Step 2 — Enumerate Source Files

Use `git ls-files` to enumerate tracked files (honors .gitignore).
Default extensions: `.md`, `.ts`, `.tsx`, `.mjs`, `.json`, `.jsonl`.
Default include dirs (in addition to tracked source): `commands/`, `.mastracode/`,
`.planning/todos/`, `.planning/ROADMAP.md`, `.changeset/`.

## Step 3 — Grep for Old Name

Run `search_content` (or `rg`) for the `oldName` substring across enumerated files.
Use case-sensitive match by default; offer case-insensitive on `scope: 'convention'`.
Collect every file:line:snippet hit.

## Step 4 — Classify Hits

Bucket each hit by file type:
- **code** — `*.ts` / `*.tsx` / `*.mjs` in `src/`, `packages/`
- **test** — `*.test.ts` / `*.spec.ts` / `__tests__/`
- **docs** — `*.md` outside `.planning/`
- **state** — `.planning/`, `.changeset/`, `todos/`, `ROADMAP.md`
- **config** — `*.json`, `*.jsonl`, `tsconfig.json`, `package.json`, `bunfig.toml`

For each bucket, decide an advisory action:
- `code` / `test` → MUST-FIX (compile/test regression risk)
- `docs` / `config` → SHOULD-FIX (drift over time)
- `state` → ADVISORY (historical artifacts may legitimately keep old name)

## Step 5 — Report

Emit a markdown table grouped by bucket. For each row:
`<file>:<line> <snippet (≤80 chars)>`. End with a summary line:
`Total: N matches across M files; K MUST-FIX, L SHOULD-FIX, P advisory.`

If `0 matches`, report `✅ No stale references found.`

## Constraints

<!-- forbidden-tools-list-start -->

The following tools are FORBIDDEN inside this skill:

- `string_replace_lsp`
- `write_file`
- `ast_smart_edit`
- `delete_file`
- `execute_command` (write paths only — read-only `git ls-files` / `rg` are allowed)

This is a READ-ONLY audit. Never edit files. Never auto-fix. Surface findings so the
caller can decide. The caller may then invoke `gh-pr-address` or hand-edit.

<!-- forbidden-tools-list-end -->
