# Phase 169 Summary — Hook DRY & Consistency Cleanup

## Objective

Eliminate duplication across hook scripts and shared schemas; improve
structural consistency per audit findings HOOK-003 through HOOK-009,
SCHEMA-001, and ARCH-002.

## Tasks Completed

### HOOK-003 — Extract `isCommitCommand()` (HIGH)

- Created `src/hooks/__helpers/commit-utils.ts` with single `COMMIT_PATTERNS`
  constant and `isCommitCommand()` export.
- Removed duplicate 5-pattern arrays from `pre-commit-gate.ts` and
  `pre-commit-drift-check.ts`; both now import the shared helper.

### HOOK-004 — Extract `collectGitContext()` (HIGH)

- Created `src/hooks/__helpers/git-context.ts` with `collectGitContext(pd)`.
- Removed two identical ~30-line blocks (git branch + diff + STATE.md parse)
  from `context-check-throttled.ts` (zone_transition and session_start paths).
- Both call sites replaced with `const { gitBranch, gitDiffSummary, phaseContext } = collectGitContext(pd)`.

### HOOK-008 — Extract throttle helpers to `hook-io.ts` (MEDIUM)

- Added `checkThrottle(key, ttlSeconds)` and `recordThrottle(key)` to
  `src/hooks/__helpers/hook-io.ts`.
- Replaced inline read-compare-write epoch pattern in:
  - `context-check-throttled.ts` (3 call sites: main, checkpoint, clear-suggest)
  - `snapshot-sync.ts`
  - `user-prompt-submit.ts`
- Removed now-unused `writeFileSync` import from `context-check-throttled.ts`.

### HOOK-006 — Extract `buildRestoreMessage()` (MEDIUM)

- Created `src/hooks/__helpers/session-restore.ts` with `buildRestoreMessage(vault)`.
- Moved 108-line MuninnDB recall block (3 `recallMuninnEngrams` calls) out of
  `session-start.ts` main() into the named exported function.
- `session-start.ts` Step 3g reduced from ~110 lines to a 3-line try/catch.

### HOOK-007 — Add `guardDedup` to `subagent-stop.ts` (MEDIUM)

- Added `guardDedup("subagent-stop")` call at hook startup.
- Added explanatory comment documenting why `post-tool-use-failure` and
  `user-prompt-submit` intentionally use per-project throttle (time-based TTL)
  rather than dedup guard (rapid re-fire prevention).

### HOOK-009 — Replace manual `process.stdout.write` with `emitResult` (MEDIUM)

- Updated `context-check-throttled.ts` developer-notes emit and systemMessage
  emit to use `emitResult()`.
- `session-start.ts` and `context-monitor.ts` were already using `emitResult`.

### SCHEMA-001 — Add defaults to `ShadowScanReportSchema` (MEDIUM)

- Added `.default(() => new Date().toISOString())` to `scanned_at`.
- Added `.default([])` to `categories_scanned`.
- Enables partial scan results to parse without callers providing those fields.

### ARCH-002 — Rename `skill-dependencies.ts` (LOW)

- `git mv src/skills/__schemas/skill-dependencies.ts skill-dependencies.schemas.ts`
- Updated 5 import sites: `skills/index.ts`, `default-dependency-map.ts`,
  `validate-skill-order.ts`, `dependency-graph.ts`.

## Files Created

- `src/hooks/__helpers/commit-utils.ts`
- `src/hooks/__helpers/git-context.ts`
- `src/hooks/__helpers/session-restore.ts`

## Files Modified

- `src/hooks/__helpers/hook-io.ts` (added checkThrottle, recordThrottle)
- `src/hooks/scripts/pre-commit-gate.ts`
- `src/hooks/scripts/pre-commit-drift-check.ts`
- `src/hooks/scripts/context-check-throttled.ts`
- `src/hooks/scripts/snapshot-sync.ts`
- `src/hooks/scripts/user-prompt-submit.ts`
- `src/hooks/scripts/session-start.ts`
- `src/hooks/scripts/subagent-stop.ts`
- `src/shared/__schemas/shadow-scanner.schemas.ts`
- `src/skills/index.ts`
- `src/skills/__helpers/default-dependency-map.ts`
- `src/skills/__helpers/validate-skill-order.ts`
- `src/skills/__helpers/dependency-graph.ts`

## Files Renamed

- `src/skills/__schemas/skill-dependencies.ts` → `skill-dependencies.schemas.ts`

## Verification

- `bunx --bun tsc --noEmit` passes (only pre-existing dist/plugin error unrelated to this phase)
- 4 atomic commits on branch `77--v4.5-platform-simplification-proactive-intelligence`

## Commits

1. `refactor(hooks): extract isCommitCommand and collectGitContext to shared helpers`
2. `refactor(hooks): extract checkThrottle/recordThrottle to hook-io`
3. `refactor(hooks): extract buildRestoreMessage, add guardDedup to subagent-stop, use emitResult`
4. `refactor(schemas): add ShadowScanReport defaults, rename skill-dependencies to schemas convention`
