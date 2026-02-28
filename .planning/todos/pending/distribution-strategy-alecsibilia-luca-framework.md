---
title: "Distribution Strategy: @alecsibilia/luca-framework"
area: cli
created: 2026-02-28T00:00:00Z
source: conversation
---

## Context

The luca-framework monorepo builds agents, skills, rules, hooks, and extensions for three AI harnesses (Claude Code, Cursor, Pi). Today, compiled outputs live inside the monorepo itself (`.claude/`, `.cursor/`, `.pi/`). The goal is to publish a single npm package that any project can install and scaffold from via `bun add -d @alecsibilia/luca-framework && bun luca init`.

## Task

Implement 6-phase distribution strategy:

### Phase 1 — Foundation (no behavior change)

- Rename npm scope `@asibilia` -> `@alecsibilia` in package.json + all templates
- Add `HarnessId` type (`"claude" | "cursor" | "pi"`) to `src/types.ts`; add `harnesses` to `LucaConfig` and `LucaManifest`
- Export `runBridgeCli()` from `src/state/bridge.ts` (extract CLI dispatch from `import.meta.main`)
- Create `bin/luca-bridge.js` bin entry
- Update `package.json` bin + version

### Phase 2 — Wizard + File Generation

- Add harness multi-select to `wizard.ts` (after stack, before tracker)
- Update `createConfigFromArgs()` and `loadConfigFromFile()` with `--harness` arg
- Add `--harness` arg to `init.ts`
- Refactor `files.ts` — conditional scaffolding per harness (`scaffoldClaude()`, `scaffoldCursor()`, `scaffoldPi()`)

### Phase 3 — Template Infrastructure

- Create `scripts/copy-harness-templates.ts` (copies compiled outputs to `templates/harness/`)
- Template structure: `templates/harness/{claude,cursor,pi}/{agents,rules,skills,...}`
- Add `templates/harness/` to `.gitignore`
- Add build scripts chaining `build:all` -> `build:templates` -> `build`

### Phase 4 — Hook Script Portability

- Add `PATH` export (`node_modules/.bin`) to all hook scripts
- Replace bridge resolution with cascading lookup (`luca-bridge` bin -> monorepo source -> empty)
- Update `@asibilia` -> `@alecsibilia` in remaining template references

### Phase 5 — Update Command + Doctor

- Update `update.ts` to handle harness-specific files based on `manifest.harnesses`
- Update `doctor.ts` for per-harness verification (Claude/Cursor/Pi checks)
- Update `init.ts` success output to list harness-specific directories

### Phase 6 — Testing

- wizard.test.ts: harness multi-select, `createConfigFromArgs` with `--harness`
- files.test.ts: conditional generation (claude-only, cursor-only, pi-only, all)
- bridge.test.ts: `runBridgeCli()` dispatch
- manifest.test.ts: backward compat (missing `harnesses` defaults to `['claude', 'cursor']`)
- Integration: `luca init --quick --harness=claude,pi` in temp dir

## Notes

Critical files: `package.json`, `src/types.ts`, `wizard.ts`, `files.ts`, `bridge.ts`, `bin/luca-bridge.js`, `init.ts`, `update.ts`, `doctor.ts`, `scripts/copy-harness-templates.ts`, hook shell scripts.

Current CLI scope is `@asibilia` v2.0.0. Wizard always scaffolds Claude+Cursor with no Pi support and no harness selection.
