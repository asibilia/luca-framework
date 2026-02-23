---
id: 51-B
status: complete
tasks_completed: [T1, T2, T3, T4, T5]
files_changed:
  - packages/luca-state/src/sanitize.ts (created)
  - packages/luca-state/src/persistence.ts (modified)
  - src/rules/index.ts (modified)
  - packages/luca-framework/src/utils/files.ts (modified)
  - packages/luca-framework/src/utils/doctor/checks/config-validation.ts (modified)
  - packages/luca-framework/src/utils/sanitize.ts (modified — NOTE comment updated)
  - src/shared/validation-utils.ts (modified — NOTE comment updated)
---

# Summary: Plan 51-B — Apply sanitizeJsonParse & Deduplicate VALID_TRACKERS

## Outcome

Applied `sanitizeJsonParse()` consistently across all `JSON.parse` calls that handle external/on-disk data, and deduplicated the `VALID_TRACKERS` constant. Created a self-contained sanitize utility in `packages/luca-state/` (per isolated domain pattern). Updated NOTE comments in all three sanitize file copies to list all locations. All builds, typechecks, and tests pass with zero regressions.

## Tasks Completed

### T1: Applied sanitizeJsonParse in persistence.ts (luca-state)

- **Created** `packages/luca-state/src/sanitize.ts` — self-contained copy of `sanitizeJsonParse()` with `stripPrototypeKeys()` and documentation noting all 3 copy locations.
- **Modified** `packages/luca-state/src/persistence.ts` — replaced `JSON.parse(text)` with `sanitizeJsonParse(text)` in `loadPersistedActor()`.

### T2: Applied sanitizeJsonParse in src/rules/index.ts

- Added `import { sanitizeJsonParse } from "../shared/validation-utils"`.
- Replaced `JSON.parse(raw)` with `sanitizeJsonParse(raw) as Record<string, any>` in `loadProfileConfig()`.
- Function remains synchronous as required (called at module evaluation time).

### T3: Applied sanitizeJsonParse in files.ts

- Added `import { sanitizeJsonParse } from "./sanitize"`.
- Replaced both `JSON.parse` calls:
  - Line 259: `existingSettings = sanitizeJsonParse(existing) as Record<string, unknown>`
  - Line 267: `const hooksSettings = sanitizeJsonParse(hooksContent) as Record<string, unknown>`

### T4: Deduplicated VALID_TRACKERS in config-validation.ts

- Added `import { VALID_TRACKERS } from "../../wizard"`.
- Removed local `const validTrackers = ["jira", "github", "none"]` declaration.
- Updated `.includes()` check with proper type narrowing: `as (typeof VALID_TRACKERS)[number]`.
- Updated error message to use `VALID_TRACKERS.join(", ")`.

### T4b (bonus): Updated NOTE comments in existing sanitize files

- Updated `packages/luca-framework/src/utils/sanitize.ts` NOTE comment to list all 3 copy locations.
- Updated `src/shared/validation-utils.ts` NOTE comment to list all 3 copy locations.

### T5: Final verification

- **tsc --noEmit**: PASS — zero type errors.
- **bun test**: PASS — 1763 tests passed, 0 failed, 6 skipped.
- **bun run build:all**: PASS — 327 files generated.
- **grep checks**: Zero `JSON.parse` on external data in target files, zero `validTrackers` local variable.

## Deviations

- **T4b (bonus)**: Updated NOTE comments in existing sanitize files to list all 3 copy locations. This was flagged by the plan checker as MEDIUM priority and is good practice for maintainability.

## Files Changed

- `packages/luca-state/src/sanitize.ts` — new sanitize utility (isolated domain copy)
- `packages/luca-state/src/persistence.ts` — JSON.parse → sanitizeJsonParse
- `src/rules/index.ts` — JSON.parse → sanitizeJsonParse
- `packages/luca-framework/src/utils/files.ts` — 2x JSON.parse → sanitizeJsonParse
- `packages/luca-framework/src/utils/doctor/checks/config-validation.ts` — VALID_TRACKERS import, local var removed
- `packages/luca-framework/src/utils/sanitize.ts` — NOTE comment updated
- `src/shared/validation-utils.ts` — NOTE comment updated
