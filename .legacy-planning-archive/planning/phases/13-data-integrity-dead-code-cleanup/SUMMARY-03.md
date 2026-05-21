---
phase: 13
plan: 3
status: complete
started: 2026-03-08T19:20:00Z
completed: 2026-03-08T19:35:00Z
---

# SUMMARY: Phase 13 Plan 03 — Remove Deprecated Legacy Hook Functions

## Outcome

All 4 tasks completed. Legacy hook functions removed from config-generators.ts and platform-adapters.ts. Build script confirmed already migrated to canonical API. Barrel exports cleaned up. H5 and H6 closed.

## Tasks Completed

### Task 1: Migrate build-shared.ts from legacy to canonical hook generators

**Commit:** `aadf014a` (STATE.md only — build-shared.ts was already migrated in a prior session)

**Finding:** `scripts/build-shared.ts` was already fully migrated to canonical generators (`resolveCanonicalRegistry`, `generateClaudeHooksConfigFromCanonical`, `generateCursorHooksConfigFromCanonical`) in a prior commit (`c30e002d`). No code changes were needed. Verified by confirming zero grep matches for legacy function names.

### Task 2: Remove legacy function exports from hooks/index.ts

**Commit:** `36bef406`

Removed from `src/hooks/index.ts`:

- Legacy config generator exports: `generateClaudeHooksConfig`, `generateCursorHooksConfig`, `generatePiExtension`
- Deprecated adapter function exports: `adaptForClaude`, `adaptForCursor`, `adaptForPi`, `CLAUDE_EVENT_MAP`, `CURSOR_EVENT_MAP`, `PI_EVENT_MAP`

Updated `index.ts` (root barrel):

- Replaced legacy `generateClaudeHooksConfig`/`generateCursorHooksConfig` re-exports with canonical `*FromCanonical` equivalents

Kept: `canonicalToLegacy`, `PlatformHookConfig` (still actively used).

### Task 3: Remove legacy functions from config-generators.ts

**Commit:** `e8a1e543`

Deleted ~230 lines:

- `generateClaudeHooksConfig()` (legacy, accepted `HookDefinition`)
- `generateCursorHooksConfig()` (legacy, accepted `HookDefinition`)
- `generatePiExtension()` (legacy, accepted `HookDefinition`)
- `buildPiMatcherCheck()` (legacy helper)
- `buildPiStdinJson()` (legacy helper)

Updated file header to reflect canonical-only API. Removed `HookDefinition` type import.

### Task 4: Remove deprecated adapter exports from platform-adapters.ts

**Commit:** `c4732e7b`

Rewrote `platform-adapters.ts`:

- Made event map constants private (non-exported) — they are still needed by the adapt functions but were duplicated in `src/hooks/adapters/`
- Removed all `@deprecated` markers from kept functions
- Updated module-level JSDoc to reflect current purpose
- Kept `PlatformHookConfig` interface, `adaptForClaude/Cursor/Pi` functions, and `canonicalToLegacy` (all still used by config-generators.ts and hook-registry.ts)

**Deviation (Rule 3 - Blocking):** The plan specified removing `adaptForClaude`, `adaptForCursor`, `adaptForPi` from platform-adapters.ts. However, `config-generators.ts` imports these functions from platform-adapters.ts, and importing them from `src/hooks/adapters/` instead would create a circular dependency (adapters import config-generators, config-generators would import adapters). The adapt functions were kept in platform-adapters.ts but had their `@deprecated` markers removed since they are actively used internal functions, not deprecated API surface.

## Verification

- `bunx --bun tsc --noEmit` passes
- Zero legacy generator function calls in `src/` and `scripts/`
- Zero deprecated adapter function exports from `src/hooks/index.ts`
- config-generators.ts reduced from 486 to 250 lines (~236 lines removed)
- platform-adapters.ts reduced from 193 to 167 lines (~26 lines removed, event maps kept private)

## Lines Removed

| File                 | Before | After | Removed  |
| -------------------- | ------ | ----- | -------- |
| config-generators.ts | 486    | 250   | ~236     |
| platform-adapters.ts | 193    | 167   | ~26      |
| hooks/index.ts       | 83     | 68    | ~15      |
| **Total**            |        |       | **~277** |

## Findings Closed

- **H5:** Deprecated platform-adapters.ts exports removed (event maps no longer exported, @deprecated markers removed)
- **H6:** Legacy config generator functions removed (~230 lines of dead code)

## Manual Step Required

User must run `bun run build:all` after this plan completes to regenerate `.claude/`, `.cursor/`, `.pi/` outputs from the updated source files.
