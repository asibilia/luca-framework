---
"@alecsibilia/luca-mastracode": minor
---

## PR feedback learning batch — 8 todos

Shipped as one PR per user direction. All eight learnings from prior PR-feedback retros, addressed thematically.

### Framework utilities (#30, #36)
- Extracted shared sanitize and numeric helpers into `src/util/sanitize.ts` (`sanitizeForLog`, `sanitizeForStorage`, `displayBounded`) and `src/util/numeric.ts` (`finiteOrNull`, `clampTokens`). Re-exported from `src/index.ts`.
- Migrated `workflow-state.ts` and `state/telemetry.ts` to import shared utils; preserved all callsite syntax via aliases.

### PR tooling (#37)
- Added `unknown` bucket to `FilterResult` in `src/review-analysis/stale-filter.ts`. Empty `diff_hunk` is now classified `unknown` (not silently routed to `stale`). Surfaced through `pr-review.ts` return shape, appendLedger payload, and summary message. Preserves boolean `stale` field for backward compat. Resolves Copilot false-positive epidemic on PRs #234/#236/#239/#247/#248/#249/#251/#253.

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
- Added `hasPlaceholderText(content)` to `src/tools/repo-cleanup.ts`. Advisory only.
- `.gitignore` globs for `.planning/telemetry/archive/`, `.planning/**/checks-convergence.json`, `.planning/**/*-capture-*.md`, `.planning/audits/memory/state.json`.

### Spawn-site invariant (#56)
- Extended `spawn-site-invariant.test.ts` with FILES-completeness check.

### Tests
- 538 tests / 30 files (was 502/27 — net +36).

Closes #15, #30, #36, #37, #40, #42, #44, #56
