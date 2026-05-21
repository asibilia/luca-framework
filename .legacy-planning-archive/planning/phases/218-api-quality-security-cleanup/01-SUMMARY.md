# Phase 218 — API Quality & Security Cleanup (Wave 1 Summary)

## Outcome: COMPLETE

**Duration:** ~5 minutes
**Commit:** ba015135

## What Was Done

### Task 1: Extract localhost guard helper (REQ-07)

**Status:** Already complete -- no work needed.

`isLocalhostRequest()` was already extracted to `~/lib/request-guards.ts` and `SIDECAR_URL` was already in `~/lib/constants.ts`. All 5 API routes (`events`, `compile`, `git/revert`, `git/history`, `git/publish`) already import from the shared helpers. This was likely addressed in a prior phase.

### Task 2: Address Phase 208 review HIGH findings (REQ-08)

**Status:** Complete.

1. **Import grouping** in `compile/route.ts` -- Reordered imports to put `next/server` before `zod` (external libs alphabetized).

2. **Date hoisting** -- Extracted `const now = (): string => new Date().toISOString()` to DRY up 6 identical `new Date().toISOString()` calls across the compile route handler. Note: these calls need to capture time at different moments (start, complete, error), so a function is appropriate rather than a single const.

3. **ShikiCodeBlock barrel export** -- Added `ShikiCodeBlock` to `components/shared/index.ts` barrel. It was already imported directly by 3 consumers (`entity-tab-container.tsx`, `diff-preview.tsx`, `agent-preview.tsx`) but was missing from the barrel.

4. **ENTITY_DOMAIN extraction** -- Moved the `ENTITY_DOMAIN` singular-to-plural entity type map from a local const in `entity-tab-container.tsx` to `~/lib/constants.ts` with JSDoc documentation. Updated the import in `entity-tab-container.tsx`.

5. **Bun.file() migration** -- Replaced `import { mkdir } from "node:fs/promises"` in `sidecar/compiler.ts` with `Bun.$\`mkdir -p ${dir}\`.quiet()`for Bun-native directory creation. The file already used`Bun.write()`for file writes;`mkdir`was the last remaining`node:fs` import.

## Deviations

- [Rule 1 - Bug] Self-review caught infinite recursion where `replace_all` accidentally replaced `new Date().toISOString()` inside the `now()` function body itself, producing `const now = (): string => now()`. Fixed immediately before commit.

## Verification

- `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json` produces only 3 pre-existing errors (in `harness-tab.tsx`, `raw-config-editor.tsx`, `file-watcher.ts`) -- none introduced by this phase.

## Files Modified

- `packages/luca-studio/app/api/compile/route.ts` -- import reorder, now() helper
- `packages/luca-studio/components/shared/index.ts` -- ShikiCodeBlock export added
- `packages/luca-studio/components/shared/entity-tab-container.tsx` -- ENTITY_DOMAIN import from constants
- `packages/luca-studio/lib/constants.ts` -- ENTITY_DOMAIN constant added
- `packages/luca-studio/sidecar/compiler.ts` -- node:fs/promises -> Bun.$ migration
