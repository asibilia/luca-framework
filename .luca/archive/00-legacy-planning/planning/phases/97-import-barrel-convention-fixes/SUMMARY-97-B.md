# SUMMARY: PLAN-97-B Convention Alignment Fixes

## Phase 97 | Wave 1 | Branch: 42--v2.6.0-code-health-context-intelligence

## Result: PASS

All 7 tasks completed successfully. All success criteria met.

## Tasks Completed

### Task 1: Replace `.sort()` with lodash `orderBy` in tribunal-consensus.ts

- **File:** `src/shared/__helpers/tribunal-consensus.ts`
- Added `import orderBy from "lodash/orderBy"`
- Replaced `[...perspectives].sort((a, b) => b.confidence - a.confidence)` with `orderBy([...perspectives], (p) => p.confidence, "desc")`
- **Commit:** `1390cfb`

### Task 2: Convert `.parse()` to `.safeParse()` in complexityToHydrationConfig

- **File:** `src/context/__helpers/hydration-snapshot.ts`
- Extracted raw config objects into a `let raw` variable with switch/break
- Replaced 4 `hydrationConfigSchema.parse(...)` calls with single `hydrationConfigSchema.safeParse(raw)`
- Added error logging and MODERATE-defaults fallback on parse failure
- **Commit:** `6baa447`

### Task 3: Convert `.parse()` to `.safeParse()` in generatePreFlightSnapshot

- **File:** `src/context/__helpers/hydration-snapshot.ts`
- Replaced `preFlightSnapshotSchema.parse(...)` with `.safeParse(...)`
- Added error logging and minimal valid snapshot fallback on parse failure
- **Commit:** `e63a6a6`

### Task 4: Sanitize `source_agent` and `file` in tribunal-rebuttals.ts

- **File:** `src/shared/__helpers/tribunal-rebuttals.ts`
- Wrapped 6 unsanitized prompt interpolations with `sanitizeForTemplate()`:
  - `buildChallengerPrompt`: `defendedFinding.file`, `defendedFinding.source_agent`, `challengerFinding.source_agent`
  - `buildDefenderPrompt`: `defendedFinding.source_agent`, `defendedFinding.file`, `challengerFinding.source_agent`
- Import for `sanitizeForTemplate` was already present
- **Commit:** `ae5887c`

### Task 5: Sanitize `milestoneVersion` in milestone-debate.ts

- **File:** `src/skills/__helpers/milestone-debate.ts`
- Added `import { sanitizeForTemplate } from "~/shared/__helpers/sanitize-template"`
- Created `safeMilestoneVersion` variable before prompt construction
- Replaced unsanitized `milestoneVersion` interpolation in both `challenger_prompt` and `defender_prompt`
- **Commit:** `712ee8e`

### Task 6: Fix bare `"crypto"` imports to `"node:crypto"`

- **Files:** `src/shared/__helpers/tribunal-detector.ts`, `src/iteration/__helpers/convergence.ts`
- Changed `import { createHash } from "crypto"` to `import { createHash } from "node:crypto"` in both files
- Note: One additional bare `"crypto"` import exists in `src/hooks/pi-extensions/__helpers/state-bridge.ts` but was out of scope for this plan
- **Commit:** `55d8f64`

### Task 7: Harden sanitizeForTemplate with trailing `}` fix and bidi defense

- **File:** `src/shared/__helpers/sanitize-template.ts`
- Added `.replace(/\$\{[^}]*\}/g, "")` to remove complete `${...}` sequences (no orphaned `}`)
- Added `.replace(/[\u202A-\u202E\u2066-\u2069]/g, "")` to strip Unicode bidi control characters
- Updated JSDoc `@example` block to reflect new behavior
- Updated 3 test expectations and added 1 new bidi test in `__tests__/src/shared/sanitize-template.test.ts`
- **Commits:** `4552688` (source), `4af991e` (tests)

## Verification

| Check                                                      | Result                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `bunx --bun tsc --noEmit`                                  | PASS (zero errors)                                              |
| `bun test`                                                 | 3147 pass, 3 fail (pre-existing MEMORY.md integration failures) |
| Zero `.sort()` in tribunal-consensus.ts                    | PASS                                                            |
| Zero `.parse()` in hydration-snapshot.ts (except fallback) | PASS                                                            |
| All prompt fields sanitized in tribunal-rebuttals.ts       | PASS                                                            |
| `milestoneVersion` sanitized in milestone-debate.ts        | PASS                                                            |
| Zero bare `"crypto"` in scope files                        | PASS                                                            |
| `sanitizeForTemplate` removes complete `${...}`            | PASS                                                            |
| `sanitizeForTemplate` strips bidi chars                    | PASS                                                            |
