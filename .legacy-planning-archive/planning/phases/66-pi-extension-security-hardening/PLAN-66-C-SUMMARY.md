# PLAN-66-C Summary: MEDIUM-severity Protection Guards

## Status: COMPLETE

## Objective

Fix three MEDIUM-severity input validation issues identified in the v2.1.0 milestone audit: tool name normalization in luca-roles, path traversal guards in luca-memory, and context string normalization in luca-purpose-gating.

## Tasks Completed

### Task 1: Normalize tool names in luca-roles.ts

- Created shared sanitize module at `src/hooks/pi-extensions/__helpers/sanitize.ts` with 8 exported functions (5 from PLAN-66-B + 3 new for PLAN-66-C)
- Added `normalizeToolName()` that trims whitespace, removes zero-width Unicode characters (U+200B, U+200C, U+200D, U+FEFF), converts to lowercase, and collapses internal whitespace
- Applied normalization at three locations:
  1. Tool parsing in `parseFrontmatter()` — tool names normalized when read from YAML
  2. Role activation in `luca_activate_role` — lookup key normalized for case-insensitive match
  3. Enforcement in `tool_call` handler — both sides normalized via `normalizeToolName()` instead of bare `.toLowerCase()`
- 70 tests covering all sanitization functions with 100% coverage

### Task 2: Add path traversal guard in luca-memory.ts

- Added `isWithinDirectory()` function to shared sanitize module that resolves both paths to absolute and checks containment
- Guards added to:
  1. `readPlanningFile()` — validates file path before any read operation
  2. `luca_append_working` — validates write path before any write operation
- Currently redundant (paths are hardcoded) but protects against future refactoring

### Task 3: Normalize purpose descriptions and contexts in luca-purpose-gating.ts

- Added `normalizeContext()` function to shared sanitize module that trims, lowercases, collapses whitespace, and handles null/undefined
- Applied normalization at five locations:
  1. `inferPurpose()` — added trim to agent name
  2. `autoDiscoverAgents()` — trim agent name from filename
  3. `luca_register_purpose` — normalize contexts from comma-separated string
  4. `luca_check_purpose` — normalize `params.context` + empty string validation
  5. `luca_eligible_agents` — normalize `params.context` + empty string validation
- Empty/whitespace-only context now returns an explicit error instead of silently matching

## Verification Results

- All 2049 tests pass, 0 failures
- Sanitize module: 70 tests, 100% function coverage, 100% line coverage
- Type checking: pre-existing TS errors in pi-extensions not related to these changes
- `.pi/` outputs regenerated via `bun run build:all --force`

## Files Modified

| File                                                           | Change                                             |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `src/hooks/pi-extensions/__helpers/sanitize.ts`                | **NEW** — shared sanitization module (8 functions) |
| `src/hooks/pi-extensions/__helpers/__tests__/sanitize.test.ts` | **NEW** — 70 tests for sanitization functions      |
| `src/hooks/pi-extensions/luca-roles.ts`                        | Import + apply `normalizeToolName` at 3 locations  |
| `src/hooks/pi-extensions/luca-memory.ts`                       | Import + apply `isWithinDirectory` at 2 locations  |
| `src/hooks/pi-extensions/luca-purpose-gating.ts`               | Import + apply `normalizeContext` at 5 locations   |
| `.pi/extensions/luca-roles.ts`                                 | Regenerated                                        |
| `.pi/extensions/luca-memory.ts`                                | Regenerated                                        |
| `.pi/extensions/luca-purpose-gating.ts`                        | Regenerated                                        |

## Deviation Notes

- PLAN-66-B's `__helpers/sanitize.ts` was found untracked (never committed) in the main repo. Recreated it in the worktree with all 5 PLAN-66-B functions plus the 3 new PLAN-66-C functions in a single module.

## Commits

1. `8a953ac` — fix(security): normalize tool names in luca-roles (Task 1)
2. `af727a5` — fix(security): add path traversal guard to luca-memory (Task 2)
3. `24ae8c4` — fix(security): normalize context strings in luca-purpose-gating (Task 3)
4. `46e5148` — build: regenerate .pi/ extension outputs
