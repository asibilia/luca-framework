# Plan 100-07 Summary: Canonical Hook Format with Platform Adapters

## Status: COMPLETE

## What Was Done

### Task 100-07-1: Define canonical hook schema

- Added `CanonicalHookSchema` with platform-independent fields (`event`, `tool_filter`, `command_filter`, `script`, `timeout`, `async`, `status_message`)
- Added `CANONICAL_EVENTS` array with 5 semantic event names: `post_tool_use`, `pre_tool_use`, `stop`, `session_end`, `session_start`
- Added `canonicalEventSchema` (z.enum) and `CanonicalEvent`/`CanonicalHook` types
- Kept `HookDefinitionSchema` unchanged for backward compatibility

### Task 100-07-2: Create platform adapter functions

- Created `src/hooks/__helpers/platform-adapters.ts` with:
  - `CLAUDE_EVENT_MAP`, `CURSOR_EVENT_MAP`, `PI_EVENT_MAP` (canonical -> platform event names)
  - `adaptForClaude()`, `adaptForCursor()`, `adaptForPi()` (pure adapter functions)
  - `canonicalToLegacy()` (converts canonical -> HookDefinition for backward compat)

### Task 100-07-3: Refactor hook registry to use canonical format

- Added `canonicalHookRegistry` as the source of truth with 9 platform-independent hook definitions
- Rewrote `hookRegistry` to delegate to `canonicalHookRegistry` via `canonicalToLegacy()`
- Added `resolveCanonicalRegistry()` helper
- All 19 existing tests pass unchanged

### Task 100-07-4: Refactor config generators to use platform adapters

- Added `generateClaudeHooksConfigFromCanonical()`, `generateCursorHooksConfigFromCanonical()`, `generatePiExtensionFromCanonical()` using platform adapters
- Kept legacy generators unchanged as wrappers
- Verified all 3 canonical generators produce byte-identical output to legacy versions

### Task 100-07-5: Normalize shell script stdin/stdout contracts

- Added standardized header comments to all 9 hook scripts documenting:
  - Canonical event and platform event mapping
  - Stdin JSON format per platform (Claude, Cursor, Pi)
  - Extraction pattern (e.g., `data.tool_input?.command ?? data.command`)
  - Stdout JSON format per platform
  - Exit code semantics

### Task 100-07-6: Create hook portability regression test suite

- Created `__tests__/src/hooks/hook-portability.test.ts` with 34 tests:
  - Platform adapter event mappings (9 tests)
  - Adapter function behavior (5 tests)
  - canonicalToLegacy roundtrip (4 tests)
  - Registry completeness (4 tests)
  - Config generation equivalence (5 tests)
  - Shell script existence and permissions (4 tests)
  - Canonical event coverage (3 tests)

### Task 100-07-7: Verify drift-free output

- `bun run build:all --force` succeeded (471 files generated)
- `bun run check:drift` reports zero drift
- All 518 hook tests pass (19 existing + 34 new portability + 465 pi-extension tests)

## Files Changed

### New Files

- `src/hooks/__helpers/platform-adapters.ts` (172 lines)
- `__tests__/src/hooks/hook-portability.test.ts` (436 lines)

### Modified Files

- `src/hooks/__schemas/hook.schemas.ts` (added canonical schema, +50 lines)
- `src/hooks/__helpers/hook-registry.ts` (canonical + legacy registries, +101/-68 lines)
- `src/hooks/__helpers/config-generators.ts` (canonical generators, +254/-5 lines)
- `src/hooks/index.ts` (expanded barrel exports, +37/-8 lines)
- `src/hooks/scripts/*.sh` (9 files, normalized header comments, +154/-26 lines)
- `.claude/hooks/*.sh` (9 files, generated output updated)
- `.cursor/hooks/*.sh` (9 files, generated output updated)

## Key Design Decisions

1. **Additive refactor**: All new code is additive. Legacy APIs are preserved as wrappers, ensuring zero breaking changes.
2. **Canonical events use snake_case**: Follows the API snake_case convention and provides a neutral format between Claude PascalCase, Cursor camelCase, and Pi snake_case.
3. **Two filter fields**: `tool_filter` maps to Claude's matcher (regex) and Pi's piMatcher (split to array). `command_filter` maps to Cursor's cursorMatcher. This captures all current platform-specific filter semantics in a canonical way.
4. **Pure function adapters**: Each adapter is a pure function with no side effects, following the no-classes rule.

## Verification

- TypeScript: `bunx --bun tsc --noEmit` passes
- Tests: 518 tests pass across 20 files
- Drift: Zero drift confirmed via `bun run check:drift`
