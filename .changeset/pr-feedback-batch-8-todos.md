---
"@alecsibilia/luca": patch
---

## PR feedback learning batch — 8 todos

Shipped as one PR per user direction. All eight learnings from prior PR-feedback retros, addressed thematically.

### Framework utilities (#30, #36)
- Extracted shared sanitize and numeric helpers into `packages/luca-mastracode/src/util/sanitize.ts` (`sanitizeForLog`, `sanitizeForStorage`, `displayBounded`) and `packages/luca-mastracode/src/util/numeric.ts` (`finiteOrNull`, `clampTokens`). Re-exported from `packages/luca-mastracode/src/index.ts`.
- Migrated `workflow-state.ts` and `state/telemetry.ts` to import shared utils; preserved all callsite syntax via aliases.

### PR tooling (#37)
- Added `unknown` bucket to `FilterResult` in `packages/luca-mastracode/src/review-analysis/stale-filter.ts`. Empty `diff_hunk` is now classified `unknown` (not silently routed to `stale`). Surfaced through `pr-review.ts` return shape, appendLedger payload, and summary message. Preserves boolean `stale` field for backward compat. Resolves Copilot false-positive epidemic on PRs #234/#236/#239/#247/#248/#249/#251/#253.

### Reviewer subagent (#44)
- Added 5th `test-quality-reviewer` perspective. Updates: reviewer.ts prose, new Test Quality block (vacuous mocks, presence-only assertions, regex over-permissiveness, stale fixtures, name-vs-assertion drift). review.md Step 4 spawns 5 reviewers in parallel.

### Skill: rename-audit (#40)
- New `.mastracode/skills/rename-audit/SKILL.md` — read-only audit for stale references after rename. 5 Steps. Read-only constraint via prohibition block.

### Reviewer-hint rule packs (#15, #30, #36, #56)
- New `.mastracode/rules/zod-dual-layer-drift.md`
- New `.mastracode/rules/input-hygiene.md`
- New `.mastracode/rules/nan-safe-numbers.md`
- New `.mastracode/rules/spawn-site-prose-rules.md`

### Repo cleanup (#42)
- Added `hasPlaceholderText(content)` to `packages/luca-mastracode/src/tools/repo-cleanup.ts`. Advisory only.
- `.gitignore` globs for `.planning/telemetry/archive/`, `.planning/**/checks-convergence.json`, `.planning/**/*-capture-*.md`.

### Spawn-site invariant (#56)
- Extended `spawn-site-invariant.test.ts` with FILES-completeness check.

### Tests
- Full suite green (baseline 502, net increase from new test files).

### Review iter 1 fixes (MF-1, MF-2)
- Backfilled flat-schema `workflowStateInputSchema` regex constraints on `perspectives` items (`.regex(/^[a-z0-9_-]+$/)`), `role` (`.min(1).regex(/^[^\r\n\t]+$/)`), and `correlationId` (`.min(1).regex(/^[^\r\n\t]+$/)`) to match per-action schemas. The initial drift-detector test was key-presence-only and silently passed with 3 live drift instances.
- Rewrote `dual-layer-schema-drift.test.ts` with `missingRegexPatterns()` helper using Zod v4 `_zod.def.checks` introspection + 4 injected-drift smoke tests proving the helper actually fails on real drift.
- Added JSDoc to `verdictFor()` documenting the 3-state contract (`stale:true` / ACTIONABLE / UNKNOWN). Cross-referenced `FilterResult.unknown` field.

Closes #15, #30, #36, #37, #40, #42, #44, #56
