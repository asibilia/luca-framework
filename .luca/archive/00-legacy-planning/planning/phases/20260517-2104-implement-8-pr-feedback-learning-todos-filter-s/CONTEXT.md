# Context: 8 PR-Feedback Learning Todos

## Decisions Table

| Decision | Choice | Rationale |
|---|---|---|
| Batch all 8 in one PR | YES | User explicit ("All 8 one run"). |
| Sanitize extraction location | `src/util/sanitize.ts` | New shared util, re-exported from `src/index.ts`. |
| Numeric extraction location | `src/util/numeric.ts` | Same pattern, parallel to sanitize. |
| #37 backward compat | Add 4th `unknown` array to FilterResult; keep `stale` boolean field | Preserve consumer contract at stale-filter.ts:374. |
| Rule-pack format | Markdown reviewer-hints at `.mastracode/rules/<slug>.md` | Existing convention (caveman.md, pr-title-format.md). NOT executable .luca/rules/*.ts — that's consumer territory. |
| #44 5th perspective gating | Always fire; output advisory-only on non-test PRs | Simpler; no review.md conditional logic. |
| #40 finalize wiring | NO. Skill ships standalone v1 | Reduce blast radius; wiring is follow-up. |
| #42 placeholder detection | Advisory NOTE only, not delete-action | Data loss risk per RISK 2. |
| #56 expansion targets | `triage.md` + `plan.md` (verified telemetry sections exist) | Inline fix any drift as part of this todo. |
| #15 drift test approach | Parametric reflection over Zod shapes | Avoids hand-curated list drift. |
| Skip MuninnDB writes | Defer until PR merged | Discoveries get verified-tier promotion at finalize, not architect. |
| Branch strategy | Single feature branch | One PR per user direction. |

## Scope Boundaries

**IN scope**:
- `src/util/sanitize.ts` + tests (new module)
- `src/util/numeric.ts` + tests (new module)
- `src/review-analysis/stale-filter.ts` + `src/tools/pr-review.ts` (add `unknown` bucket)
- `src/__tests__/stale-filter.test.ts` (new)
- `src/__tests__/dual-layer-schema-drift.test.ts` (new)
- `src/__tests__/spawn-site-invariant.test.ts` (extend FILES)
- `src/subagents/reviewer.ts` (5th perspective block)
- `src/instructions/review.md` (spawn 5, correlationIds, count prose)
- `src/instructions/plan.md` + `src/instructions/triage.md` (verify/fix telemetry sections)
- `src/tools/repo-cleanup.ts` + `src/tools/cleanup-fixes.ts` (placeholder detector + gitignore additions)
- `.mastracode/skills/rename-audit/SKILL.md` (new)
- `.mastracode/rules/zod-dual-layer-drift.md` (new)
- `.mastracode/rules/input-hygiene.md` (new)
- `.mastracode/rules/nan-safe-numbers.md` (new)
- `.mastracode/rules/spawn-site-prose-rules.md` (new)
- `.gitignore` (transient-artifact globs)
- `src/index.ts` (re-export new utils)
- `.changeset/pr-feedback-batch.md` (minor bump)

**OUT of scope**:
- Wiring rename-audit into finalize claim-verifier (follow-up)
- ESLint rule packs (markdown only)
- Repo-cleanup auto-deletion of placeholders (advisory only)
- Removing duplicate sanitize implementations entirely (re-export shim retained for backward compat)
- 5th reviewer gating logic (always fires v1)
