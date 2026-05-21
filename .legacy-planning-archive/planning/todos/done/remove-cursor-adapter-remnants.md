---
title: Remove Cursor adapter remnants and .cursor/ template references
area: build
created: 2026-04-01
source: conversation
---

## Context

Phase 159 removed the `.cursor/` build output directory and narrowed platform support to Claude Code only. However, the adapter source code, template references, and hook config for Cursor were left behind. A codebase search for `.cursor` found 1120 occurrences across 331 files (most in `.planning/` history, but many in active source and templates).

## Task

Remove all remaining Cursor-specific code and references from active source files and templates:

1. **`src/adapters/cursor/`** (3 files: `cursor-adapter.ts`, `cursor-hook-map.ts`, `index.ts`) -- delete the adapter factory. It's registered in `register-builtins.ts` and referenced in `module-boundary.rule.ts` but has no build target.

2. **`src/adapters/__helpers/adapter-registry.ts`** -- remove the `{ path: ".cursor", adapterName: "cursor" }` entry.

3. **`src/adapters/__helpers/adapter-report-cli.ts`** -- remove `cursor: ".cursor"` from the output dir map.

4. **`src/adapters/__helpers/register-builtins.ts`** -- remove `createCursorAdapter` import and registration.

5. **`src/rules/general/module-boundary.rule.ts`** -- remove `cursorAdapter` import/reference.

6. **`packages/luca-framework/templates/hooks/cursor-hooks.json`** -- delete (Cursor hook config template).

7. **`packages/luca-framework/templates/framework/`** -- update workflow/reference templates that still reference `.cursor/luca/` paths to use `.claude/luca/` or make them platform-agnostic via branding variables.

8. **`packages/luca-framework/.claude/skills/`** -- audit generated skill files for `.cursor/` path references.

9. **Adapter compatibility validator** -- check if `validateCursorOutput` in `__helpers/compatibility-validator.ts` can be removed.

## Notes

- `.planning/` history files (phases, milestones, summaries) should NOT be edited -- they're historical records.
- The `packages/luca-framework/.claude/` generated files will be rebuilt from source after `bun run build:all`, so focus on `src/` source files.
- After cleanup, `grep -ri '\.cursor' src/ packages/luca-framework/templates/` should return zero results (excluding `.planning/`).
- This is a follow-up to Phase 159 (remove non-Claude platforms) which was marked COMPLETE but left adapter source code intact.
