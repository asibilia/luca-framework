# Code Review — Wave 1

**Date**: 2026-05-17
**Complexity**: CRITICAL
**Review Iteration**: 1 / 2
**Branch**: feat/pr-feedback-batch-8-todos

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| #37 filter-stale empty diff_hunk → unknown bucket | MET | `stale-filter.ts` `FilterResult.unknown`, `StaleReason += 'empty-diff-hunk'`, dispatcher routing; `stale-filter.test.ts` 4-bucket negatives |
| #40 rename-audit skill | MET | `packages/luca-mastracode/skills/rename-audit/SKILL.md` 5 Steps + prohibition |
| #15 Zod drift detector rule pack | **PARTIAL** | Rule pack exists at `.mastracode/rules/zod-dual-layer-drift.md`, but the new drift-detector test fails to catch live drift on perspectives/role/correlationId regex omissions — see MUST-FIX-1 |
| #30 input-hygiene helpers + rule pack | MET | `src/util/sanitize.ts` 3 exports, rule pack present, callsites migrated |
| #36 NaN-safe rule pack | MET | `src/util/numeric.ts` 2 exports, rule pack present |
| #44 reviewer test-quality perspective | MET | `reviewer.ts` 5th block, `review.md` 5 spawn entries — VERIFIED this very review used 5 reviewers |
| #56 spawn-site coverage expansion + prose-directive rule pack | MET | FILES completeness test added, prose-directive rule pack at `.mastracode/rules/spawn-site-prose-rules.md` |
| #42 repo-cleanup transient + placeholder | MET | `hasPlaceholderText` exported, `.gitignore` 4 globs added |

## Automated Checks

| Check | Status | Notes |
|-------|--------|-------|
| tsc | pass | 0 errors |
| bun-test | pass | 538/538 (was 502, +36 net) |
| eslint | skipped | (not run in this review pass; baseline pre-existing errors ack'd) |

## Code Review Findings

### MUST-FIX (2)

- **[test-quality / arch / security]** Dual-layer schema drift test is key-presence-only AND real drift exists in the same file
  - File: `packages/luca-mastracode/src/__tests__/dual-layer-schema-drift.test.ts:44-51`
  - Live drift instances confirmed in `packages/luca-mastracode/src/tools/workflow-state.ts`:
    - `saveReviewResultsAction.perspectives` items have `.regex(/^[a-z0-9_-]+$/)` at line 200-203; flat schema `perspectives` at line 490-496 has only `.max(64)` — regex omitted
    - `recordSubagentAction.role` has `.regex(/^[^\r\n\t]+$/)` at line 274; flat schema `role` at line 563-569 has only `.max(64)` — regex omitted
    - `recordSubagentAction.correlationId` has `.regex(/^[^\r\n\t]+$/)` at line 280; flat schema `correlationId` at line 570-576 has only `.max(128)` — regex omitted
  - Three reviewers (test-quality, security, architecture) independently flagged this. The drift-detector test was the deliverable for #15 — and it passes against real drift on its own day-one merge.
  - Fix: Either (a) backfill the missing flat-schema constraints to match per-action, AND extend the test to introspect `_def.checks?.map(c => c.kind)` for typeName+constraint parity; or (b) the more robust "round-trip a known-bad value" approach — for each field, try `parse({[field]: 'UPPERCASE-VIOLATOR'})` on both schemas and assert per-action rejects while flat schema's gap is detected and reported. Add an injected-drift smoke test that proves the loop fails when the regex is intentionally removed.

- **[dx]** `verdictFor` and `FilterResult.unknown` lack JSDoc documenting 3-state semantic
  - File: `packages/luca-mastracode/src/review-analysis/stale-filter.ts:79` (FilterResult.unknown), `:268` (verdictFor)
  - `StaleVerdict.stale: false` carries two distinct meanings: ACTIONABLE (anchor matched, not stale) vs UNKNOWN (empty-diff-hunk, cannot classify). The disambiguation lives only inside the function body (lines 275-278) and the optional `reason` field — not in the type-level contract. Callers checking `stale === false` will misroute unknown comments. Bug-prone API surface.
  - Fix: Add a JSDoc above `verdictFor` spelling out the 3-state contract explicitly (stale:true / stale:false+reason:undefined / stale:false+reason:'empty-diff-hunk' → MUST route to unknown). Also extend the `FilterResult.unknown` field comment to cross-reference the sentinel.

### SHOULD-FIX (10) — advisory, deferred

- [dx] `hasPlaceholderText` JSDoc missing `@returns` describing `pattern` label format
- [dx] `spawn-site-invariant.test.ts:76` assertion lacks file-name in failure message
- [dx] 4 rule packs missing explicit `## Example` section
- [dx] `rename-audit/SKILL.md` missing `## Anti-pattern` / `## Example` blocks
- [security] `loadAlwaysApplyRules()` injects `.mastracode/rules/*.md` body verbatim into agent prompts without sanitization (`rules-loader.ts:64-66`) — defense-in-depth gap, no live exploit
- [simpl] Local sanitize aliases (`workflow-state.ts:97-103`, `telemetry.ts:59-63`) are pure indirection — could call imports directly
- [simpl] Per-action schema exports expand API surface for one test consumer — consider `WORKFLOW_ACTION_SCHEMAS` registry object instead
- [simpl] `FilterResult.unknown` has zero distinct downstream handling — could collapse into `skipped` (rejected: count surfaced in ledger + clearer intent)
- [simpl] `displayBounded` exported from `index.ts:51` with zero internal callsites
- [test-quality] `spawn-site-invariant.test.ts` `toContain('omit')` susceptible to incidental match; `repo-cleanup-placeholder.test.ts:31-35` missing `toHaveLength(4)` exhaustiveness

### NOTE (8) — advisory

- sanitize.ts / numeric.ts JSDocs exemplary
- stale-filter.test.ts empty-diff_hunk path has full 4-bucket negative assertions ✓
- changeset accurate, no bare ``` fences
- 4 rule packs + caveman.md + pr-title-format.md (6 total — 4 new from this PR)
- spawn-site completeness test uses correct array `.toContain()` (not substring) ✓
- `.gitignore` `**` globs intentional — PHASE_WHITELIST_STRICT confirms ephemerality of `checks-convergence.json`
- displayBounded uses code-unit slice (surrogate-split risk, telemetry-only)
- sanitizeForStorage strips CR/LF/tab only (no ANSI/null bytes, acceptable for current paths)

## Verdict

**ISSUES_FOUND** — 2 MUST-FIX. Both are convergent across multiple perspectives. Iteration plan written for Execute.

The #15 deliverable (schema drift test) shipping with live drift in the same file is the central correctness issue. Fixing the test will reveal the constraints to backfill, closing both gaps in one pass.
