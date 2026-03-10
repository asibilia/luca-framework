# Code Review — Phase 142

**Timestamp:** 2026-03-10T21:00:00Z
**Files reviewed:** 12
**Reviewers:** security-auditor, dx-advocate, code-simplifier, code-architect

## Severity Summary

| Severity | Count                                 |
| -------- | ------------------------------------- |
| CRITICAL | 0                                     |
| HIGH     | 1 (pre-existing, scoped to Phase 143) |
| MEDIUM   | 5                                     |
| LOW      | 9                                     |

## Findings

### HIGH

1. **dx-advocate** — `packages/luca-observer/app/api/todos/route.ts:2` — Uses `node:fs/promises` (readdir, stat) instead of Bun APIs. Pre-existing issue, already tracked as HIGH #4 in milestone audit, scoped to Phase 143.

### MEDIUM

2. **security-auditor** — `packages/luca-observer/app/api/todos/route.ts:147` — Env var path canonicalized but not containment-checked. Mitigated by trust model (env vars are operator-set).
3. **security-auditor** — `src/shared/__helpers/memory-context-builder.ts:238` — Body content in XML block not escaped. Mitigated by content source being system-internal MuninnDB engrams.
4. **dx-advocate** — `src/shared/__helpers/sanitize-template.ts:115` + `src/shared/index.ts` — Two similarly named regex-escaping functions (`escapeRegex` pre-existing, `escapeRegExp` new). Potential confusion.
5. **dx-advocate** / **simplifier** — `src/shared/__helpers/recall-cache.ts:117` + `memory-context-builder.ts:48` — Duplicated `evictOldestIfNeeded` helper. Intentional per plan (minimal change scope).
6. **code-architect** — `.claude/rules/module-boundary.md` — Built rule file stale vs source. Requires `bun run build:all` (already tracked as build drift).

### LOW (9 items)

- dx: import grouping in hydration-snapshot.ts, .parse() vs .safeParse() in memory-context-builder.ts and embedding-recall.ts, mixed path modules in scanner.ts, TodoSchema field naming comment
- simplifier: extractConfidenceScore verbosity, triple-layer normalizer fallback, unreachable startsWith("/") guard, repeated eviction pattern
- architect: stale EXCEPTIONS in check-domain-boundaries.ts, node:fs in todos route (duplicate of HIGH)

## Disposition

No blocking issues. HIGH #1 is pre-existing and tracked in Phase 143. MEDIUM items are either intentional design choices, defense-in-depth suggestions, or require `bun run build:all`. Phase 142 changes are clean and correctly scoped.
