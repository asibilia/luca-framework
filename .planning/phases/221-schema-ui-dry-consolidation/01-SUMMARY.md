---
phase: 221
plan: 1
type: refactor
status: complete
---

# Phase 221 Summary — Schema & UI DRY Consolidation

## Objective

Extract reusable schema fragments, shared UI components, and concept prefix filtering helper to reduce duplication across Luca Studio.

## Tasks Completed

### Task 1: Extract reusable schema fragments (7b9b3f4c)

Created `vaultParam`, `limitParam()`, and `bodyLimitParam()` reusable schema fragments at the top of `lib/muninn-schemas.ts`. Replaced 17 repetitive vault/limit Zod definitions across all MuninnDB request and query schemas with these shared helpers.

- `vaultParam` — `z.string().min(1).max(100).default("default")` (used for all vault fields)
- `limitParam(max, def)` — coerced number for query params (URLSearchParams strings)
- `bodyLimitParam(max, def)` — non-coerced number for JSON request bodies

### Task 2: Extract shared conflict resolution hook (d0e96045)

Created `hooks/use-entity-conflict.ts` with a `useEntityConflict` hook that consolidates the duplicated conflict resolution logic (handleAcceptLocal, handleAcceptServer, handleDismissConflict) from agents, skills, and rules pages. Each page now passes its specific endpoint and metadata configuration to the shared hook instead of duplicating ~30 lines of conflict handling code.

### Task 3: Extract CompileStatusBadge components (80be1ae3)

Extracted 6 similar compile status indicator divs into two reusable internal components within `entity-tab-container.tsx`:

- `CompileStatusIcon` — small inline icon for tab trigger (spinner/check/x)
- `CompileStatusBanner` — full-width banner with icon and descriptive text for tab content

Both components are backed by a `COMPILE_STATUS_CONFIG` map that centralizes icon, color, and label configuration for each compile state.

### Task 4: Add Zod response schema validation to sidecar compiler (9f8e8aa2)

Added `CompileSuccessResponseSchema` and `CompileErrorResponseSchema` to the sidecar compiler. The `jsonResponse` helper now accepts an optional `responseSchema` parameter for validation. Validation failures are logged but do not block the response (same pattern as `muninnProxyHandler`).

### Task 5: Extract filterByConceptPrefix helper (00daa83a)

Created `lib/muninn-helpers.ts` with a `filterByConceptPrefix` helper that consolidates the duplicated concept prefix filtering pattern from metrics, observations, and zone-history routes. Each route now delegates fetch + filter to the shared helper instead of reimplementing the over-fetch + filter + slice pattern inline.

### Type error fixes (58d12a2a)

Fixed three type errors introduced by the refactoring:

- Widened `metadata` param in `useEntityConflict` to `unknown` for `EntityMetadata` compatibility
- Removed redundant `!== "idle"` comparison (already narrowed by `sseMatchesEntity`)
- Used `MuninnEngram` type directly in `muninn-helpers.ts` instead of custom `EngramLike`

## Verification

- `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json` passes (0 new errors; 3 pre-existing errors in harness-tab.tsx, raw-config-editor.tsx, file-watcher.ts are unrelated)
- All changes are purely structural refactoring with no behavioral changes

## Deviations

None. All tasks executed as planned.

## Files Modified

| File                                                              | Change                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/luca-studio/lib/muninn-schemas.ts`                      | Added vaultParam, limitParam, bodyLimitParam; replaced 17 manual definitions |
| `packages/luca-studio/hooks/use-entity-conflict.ts`               | **New** — shared conflict resolution hook                                    |
| `packages/luca-studio/app/agents/page.tsx`                        | Replaced inline conflict logic with useEntityConflict hook                   |
| `packages/luca-studio/app/skills/page.tsx`                        | Replaced inline conflict logic with useEntityConflict hook                   |
| `packages/luca-studio/app/rules/page.tsx`                         | Replaced inline conflict logic with useEntityConflict hook                   |
| `packages/luca-studio/components/shared/entity-tab-container.tsx` | Extracted CompileStatusIcon + CompileStatusBanner                            |
| `packages/luca-studio/sidecar/compiler.ts`                        | Added response schema validation                                             |
| `packages/luca-studio/lib/muninn-helpers.ts`                      | **New** — filterByConceptPrefix helper                                       |
| `packages/luca-studio/app/api/muninn/metrics/route.ts`            | Refactored to use filterByConceptPrefix                                      |
| `packages/luca-studio/app/api/muninn/observations/route.ts`       | Refactored to use filterByConceptPrefix                                      |
| `packages/luca-studio/app/api/muninn/zone-history/route.ts`       | Refactored to use filterByConceptPrefix                                      |

## Commits

1. `7b9b3f4c` — refactor(studio): extract reusable vaultParam and limitParam schema fragments
2. `d0e96045` — refactor(studio): extract shared useEntityConflict hook from entity pages
3. `80be1ae3` — refactor(studio): extract CompileStatusIcon and CompileStatusBanner components
4. `9f8e8aa2` — refactor(studio): add Zod response schema validation to sidecar compiler
5. `00daa83a` — refactor(studio): extract filterByConceptPrefix helper for MuninnDB routes
6. `58d12a2a` — fix(studio): resolve type errors from DRY consolidation refactoring
