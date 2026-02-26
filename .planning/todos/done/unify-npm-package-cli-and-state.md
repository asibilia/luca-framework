---
title: "Unify npm package: merge state management + CLI scaffold + plugin runner"
area: packaging
created: 2026-02-16
source: conversation
---

## Context

The framework needs a single publishable npm package (`@alecsibilia/luca-framework`) that serves as both the state management library AND the CLI entry point for users adopting the framework in their own repos.

## Task

Merge the state management package (`luca-state`) and a new CLI tool into a single `@alecsibilia/luca-framework` npm package with the following capabilities:

### CLI Commands (via `npm run luca -- <cmd>`)

Users add a script to their `package.json`:

```json
{
  "scripts": {
    "luca": "luca"
  }
}
```

Then run commands like:

- **`npm run luca -- init`** — Interactive scaffold prompt:
  - Choose target: Claude, Cursor, or both
  - Scaffolds `.claude/` and/or `.cursor/` directories with framework rules, hooks, skills, settings
  - Copies relevant config files (rules, hooks, skills, settings.json, etc.)

- **`npm run luca -- run:claude`** — Opens Claude Code with the plugin flag:
  - Runs: `claude --plugin-dir ./node_modules/@alecsibilia/luca-framework/dist`
  - Convenient shortcut so users don't need to remember the plugin path

- **`npm run luca -- run:cursor`** — (future) Similar convenience for Cursor if applicable

### Plugin Mode vs Extract Mode

- **Plugin mode (Claude):** User installs the package and runs `npm run luca -- run:claude`. No files extracted into their repo. Framework lives in `node_modules`.
- **Extract mode:** User runs `npm run luca -- init` and framework files are scaffolded into `.claude/` or `.cursor/`. Files live in their repo and can be customized.

### Package Structure

- Package name: `@alecsibilia/luca-framework`
- Must include a `bin` entry for the `luca` CLI
- Must export state management APIs (current `luca-state` functionality)
- `dist/` must be structured so `--plugin-dir` works for Claude plugin mode

## Design Decisions

- CLI namespace: `npm run luca -- <cmd>` (not npx)
- Package name: `@alecsibilia/luca-framework` (existing scoped name)
- Scaffold target: interactive prompt (Claude, Cursor, or both)
- State management: existing `luca-state` package absorbed into this unified package

## Notes

- Current `luca-state` package is at `packages/luca-state/` with its own bin entry, XState v5 machine, and bridge CLI
- The unified package must preserve backward compatibility with existing state machine functionality
- Consider how `--plugin-dir` expects the dist folder to be structured (rules, hooks, skills, settings)
- The `init` command should be idempotent (safe to re-run without destroying customizations)
