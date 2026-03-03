# Phase 95-E Summary: Update module-boundary.md documented exceptions

## What Was Done

### Task 1: Cross-tier import audit

- Confirmed `src/skills/` has zero imports from `~/agents` -- entity isolation is clean
- Confirmed `src/agents/` has zero imports from `~/skills` or `~/rules`
- Verified all Phase 95 imports follow tier rules:
  - `shared` (T0) -> `complexity` (T0): within-tier, allowed
  - `agents` (T2) -> `shared` (T0): downward, allowed
  - `iteration` (T1) -> `shared` (T0): downward, allowed
- Verified the `shared/__helpers/validation-utils.ts` -> entity schemas exception is still active and required (T0 -> T2)

### Task 2: Exceptions table update

- **Kept**: `shared/__helpers/validation-utils.ts` -> agents/skills/rules `__schemas/` (genuine T0 -> T2 upward import)
- **Removed**: `harness/parsers/parser-registry.ts` -> `~/harness/__schemas/harness.schemas` -- this was never a cross-tier violation; it is an intra-domain import (harness -> harness), explicitly allowed by Rule 3
- Added "Removed exceptions" section documenting the rationale
- Updated all 4 copies of the rule:
  1. `src/rules/general/module-boundary.rule.ts` (source of truth)
  2. `.claude/rules/module-boundary.md` (generated - Claude Code)
  3. `packages/luca-framework/.claude/rules/module-boundary.md` (generated - package)
  4. `.cursor/rules/module-boundary.mdc` (generated - Cursor root)
  5. `packages/luca-framework/.cursor/rules/module-boundary.mdc` (generated - Cursor package)

### Task 3: Final verification

- `bunx --bun tsc --noEmit` passes cleanly (zero errors)
- No stale tribunal references found in module-boundary documentation
- `harness/parsers/parser-registry.ts` confirmed to exist and import from `~/harness/__schemas/harness.schemas` (intra-domain, correctly removed from exceptions)

## Key Finding

The harness parser exception was incorrectly listed from the start. `harness/parsers/parser-registry.ts` importing from `~/harness/__schemas/harness.schemas` is a within-domain import. Rule 3 explicitly allows direct `__schemas/` imports, and Rule 4 only restricts cross-domain `__helpers/` imports. Phase 95-E corrects this documentation inaccuracy.
