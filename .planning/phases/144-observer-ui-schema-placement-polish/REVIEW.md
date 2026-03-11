# Code Review — Phase 144

**Timestamp:** 2026-03-11T15:10:00Z
**Files reviewed:** 14
**Reviewers:** dx-advocate, code-simplifier, code-architect, ui

## Severity Summary

| Severity | Count | Fixed |
| -------- | ----- | ----- |
| CRITICAL | 0     | -     |
| HIGH     | 5     | 5     |
| MEDIUM   | 12    | 3     |
| LOW      | 7     | 2     |

## Fixed Issues

### HIGH (all fixed)

1. **TodoRow Card flex-col vs flex-row** (ui) — False positive: cn() uses tailwind-merge which resolves flex-direction conflicts correctly. No fix needed.
2. **Missing list semantics** (ui) — Added `<ul role="list">` / `<li>` structure for todo items. WCAG 1.3.1 compliance.
3. **TodoResponseSchema.parse() → safeParse()** (dx) — Replaced direct parse() with safeParse() per schema-first-parsing rule. Removed `|| undefined` coercion.
4. **DRY: DetermineFeedbackConfig inlines RecalledEngramSchema** (simplifier) — Replaced inline z.object with direct RecalledEngramSchema reference.
5. **DRY: computeFeedbackScore duplicates confidence parsing** (simplifier) — Extracted parseConfidenceLevel() helper shared by both computeFeedbackScore and extractConfidenceScore.

### MEDIUM (3 fixed, 9 deferred)

**Fixed:**

- recall-cache.ts schema re-exports removed from \_\_helpers/ (code-architect, dx)
- Duplicate isFinished predicate extracted in todo-tracker.tsx (simplifier)
- native .filter() replaced with lodash filter in route.ts (dx)

**Deferred (pre-existing, outside phase scope):**

- Schema-in-helpers in format.ts, scaffolding.ts, marketplace.ts, memory-context-builder.ts, session-digest.ts
- skill-dependencies.ts naming convention (.schemas.ts suffix missing)
- agentName camelCase in RecallScoringContextSchema
- lodash preference in agent-interop-scanner.ts, embedding-recall.ts, memory-feedback.ts

### LOW (2 fixed, 5 deferred)

**Fixed:**

- aria-label added to Progress component
- Unnecessary variable aliases replaced with destructuring

**Deferred:**

- Import order in route.ts
- Duplicate imports in validate-skill-order.ts
- .slice → lodash take (already fixed)
- computeFeedbackScore export inconsistency
- Glob-based existence check in findProjectRoot
