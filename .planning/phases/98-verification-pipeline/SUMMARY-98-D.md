# SUMMARY — PLAN-98-D: Replace Manual Group-Into-Map with lodash groupBy

**Phase:** 98 | **Wave:** 1 | **Issue:** #42
**Status:** COMPLETE

## Changes Made

### Task 1: `src/shared/__helpers/tribunal-rebuttals.ts`

- Added `import groupBy from "lodash/groupBy"`
- Replaced 9-line manual `Map<string, Rebuttal[]>` building loop with single `groupBy(rebuttals, (r) => r.finding_id)` call
- Updated downstream `.get(finding.id) ?? []` to `[finding.id] ?? []` (Record access)

### Task 2: `src/shared/__helpers/tribunal-detector.ts`

- Added `import groupBy from "lodash/groupBy"`
- Replaced 9-line manual `Map<string, ReviewFinding[]>` building loop with single `groupBy(findings, (f) => \`${f.file}:${f.line}\`)` call
- Updated iteration from `for (const [, group] of groups)` to `for (const group of Object.values(groups))`

### Task 3: `src/skills/__helpers/pr-verdict-debate.ts`

- Added `import groupBy from "lodash/groupBy"`
- Replaced 8-line manual `Map<string, ValidatorVerdict[]>` building loop with single `groupBy(verdicts, (v) => v.comment_id)` call
- Updated iteration from `for (const [commentId, commentVerdicts] of byComment)` to `for (const [commentId, commentVerdicts] of Object.entries(byComment))`

### Task 4 & 5: `src/memory/__helpers/compression.ts`

- Added `import groupBy from "lodash/groupBy"`
- Changed `detectDuplicates` return type from `Map<string, string[]>` to `Record<string, string[]>`
- Replaced manual Map building with `groupBy` + map to extract IDs
- Updated consumer: `for (const [, ids] of duplicateMap)` -> `for (const ids of Object.values(duplicateMap))`
- Updated consumer: `duplicateMap.get(normalizedTitle)` -> `duplicateMap[normalizedTitle]`

## Verification

- `bunx --bun tsc --noEmit` — PASS (clean, zero errors)
- `bun test` (modified domains) — PASS (600/600 tests, 0 failures)
- Full suite bridge failures are pre-existing module resolution issues (documented in CLAUDE.md), unrelated to these changes

## Commits

1. `320f470` — refactor(shared): #42 replace manual Map grouping with lodash/groupBy in tribunal-rebuttals.ts
2. `bae8770` — refactor(shared): #42 replace manual Map grouping with lodash/groupBy in tribunal-detector.ts
3. `5dc5718` — refactor(skills): #42 replace manual Map grouping with lodash/groupBy in pr-verdict-debate.ts
4. `83eecb0` — refactor(memory): #42 replace manual Map grouping with lodash/groupBy in compression.ts

## Net Impact

- **4 files changed** across 3 domains (shared, skills, memory)
- **4 lodash/groupBy imports added**
- **~38 lines of manual Map-building code removed**, replaced with ~4 one-liner groupBy calls
- Zero manual "iterate, get-or-create array in Map, push" patterns remain in target files
