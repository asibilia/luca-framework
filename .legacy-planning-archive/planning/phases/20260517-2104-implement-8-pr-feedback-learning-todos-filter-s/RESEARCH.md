# Research: 8 PR-Feedback Learning Todos

## Summary

Eight PR-feedback learnings span pr-tooling, framework utilities, rule-packs, reviewer subagent, repo-cleanup, instruction files, and tests. Most todos are structurally independent and can land in one CRITICAL-complexity PR. The highest-risk items (#37, #42, #30) require careful preservation of existing contracts (boolean fields, denylist semantics, module-private callsites). Rule-pack infrastructure already exists at `src/rule-engine/` — new packs can drop in without scaffolding work.

## Scope

| Todo | Primary Files | Key Lines |
|---|---|---|
| #37 filter-stale | `src/review-analysis/stale-filter.ts`, `src/tools/pr-review.ts` | stale-filter.ts:102-121, 188-251, 265-337; pr-review.ts:135-170 |
| #40 rename-audit | NEW `.mastracode/skills/rename-audit/SKILL.md` (+ optional `src/state/claim-verifier.ts` extension) | finalize.md:535 sequence |
| #15 Zod drift | `src/tools/workflow-state.ts`, NEW `src/__tests__/dual-layer-schema-drift.test.ts` | workflow-state.ts:319-406, 440-741 |
| #30 Input-hygiene | NEW `src/util/sanitize.ts`, MOD `workflow-state.ts:137-155`, MOD `state/telemetry.ts:62-67` | + `src/index.ts:32` re-export |
| #36 NaN-safe | NEW `src/util/numeric.ts`, MOD `workflow-state.ts:106-123` | + NEW rule-pack `.luca/rules/numeric-safety.ts` template |
| #44 Reviewer perspective | `src/subagents/reviewer.ts:20-43`, `src/instructions/review.md:64-85` | telemetry correlationId list at review.md:59 |
| #56 Spawn-site | `src/__tests__/spawn-site-invariant.test.ts:31-37` FILES array | Add `plan.md`/`triage.md` + verify telemetry sections |
| #42 Repo-cleanup | `src/tools/repo-cleanup.ts:60-244`, `src/tools/cleanup-fixes.ts:56-78`, `.gitignore` | Add placeholder detectors near `:139` |

Blast radius: ~25-35 files touched. Test impact: ~5 new test files + existing test extensions.

## Architecture

- **PR-review filter pipeline**: pure-data layer (`stale-filter.ts`) wrapped by tool (`pr-review.ts`). Return shape already 3-way (`actionable`/`stale`/`replies`). 4th classification can be added by extending `FilterResult` at `stale-filter.ts:70-79`.
- **Skills**: YAML frontmatter (`name:`, `description:`) + numbered Step H2 sections. Optional HTML-sentinel prohibition block. Live at `.mastracode/skills/<name>/SKILL.md`.
- **Rule-pack infrastructure**: complete at `src/rule-engine/`. `defineRule()` + auto-discovery in `.luca/rules/<name>.ts`. `RuleFinding` is compatible with `ReviewFinding`. No reviewer changes needed.
- **Sanitize helpers**: currently module-private in 2 files (workflow-state.ts, telemetry.ts). Extraction target: `src/util/sanitize.ts` exporting `sanitizeForLog` (200-char cap, console), `sanitizeForStorage` (no cap, schema enforced), `displayBounded` (length-bounded display).
- **Number guards**: `finiteOrNull` and `clampTokens` private at workflow-state.ts:106-123. Extraction target: `src/util/numeric.ts`.
- **Reviewer subagent**: single `HarnessSubagent` (id: `'reviewer'`), 4 perspectives inline as `###` blocks. Caller-dispatched at spawn (no internal routing). Read-only tool allowlist.
- **Spawn-site test**: 4000-char region anchored on `Subagent Telemetry` heading; 7 assertions per file. FILES list is hand-curated.
- **Repo-cleanup**: whitelist-gated straggler detector with 6 actions. `cleanup-artifacts` recurses into phase subdirs. Gitignore appends literal paths only.

## Patterns

- **GitHub-comment schema**: Zod schema at `pr-review.ts:36-52`. `diff_hunk: z.string()` opaque, `commit_id: z.string()` 40-char SHA.
- **Test naming**: lettered subtests `(a)`, `(b)`, ... within `describe` blocks (`workflow-state-actions.test.ts`).
- **Schema-drift test style**: dynamic `test()` names from `${rel}:${lineNo} ${slice}`, with diagnostic message in `expect(value, msg).toBe(...)` style.
- **Sanitize callsite pattern**: ``[telemetry] ... ${sanitizeLogMessage(err)}``. JSDoc note at workflow-state.ts:135 banning use for persisted fields.
- **Number-guard pattern**: `inputTokens: clampTokens(inputTokens)` for tokens, `{ durationMs: finiteOrNull(durationMs) }` for durations. `?? 0` explicitly banned for verifiedCount (workflow-state.ts:1791 comment).
- **Reviewer checklist**: H3 perspective heading + bullet list of checks. Output format with PERSPECTIVE/VERDICT/FINDINGS/CONSOLIDATED blocks.
- **Spawn-site assertion**: required-substring loop + negative regex for fabricated round-numbers `/durationMs:\s*(45000|60000|75000|90000|120000)\b/`.
- **Cleanup transient pattern**: switch-case dispatching to `cleanDir()` helper with named predicates (`isCaptureArtifact`, `isReviewArtifact`).

## Dependencies

- **#30/#15/#36 independent.** No forced ordering. Sanitize helpers private; not imported anywhere external.
- **#40 (skill) independent of finalize wiring.** Skill ships standalone; verification-gate hook is optional.
- **#56 needs plan.md/triage.md telemetry sections to exist** before adding to FILES (verify each contains `Subagent Telemetry` + required substrings, else fix the mode file first).
- **#44 fan-out**: adding 5th perspective requires edits in reviewer.ts + review.md (spawn list + correlationId list + count prose) + possibly spawn-site test.
- **Rule-packs auto-discovered** from `.luca/rules/`. No registration needed.
- **bun test auto-discovers** new `*.test.ts` recursively.

## Risks

Ranked by severity:

- **HIGH #37**: `stale-filter.ts:374` checks `if (v.stale)` boolean truthiness. Changing to enum breaks consumers. **Mitigation**: keep boolean field; add separate `staleCategory?: 'stale' | 'actionable' | 'unknown'`, or 4th bucket `unknown[]` in FilterResult.
- **HIGH #42**: LLM shadow scanner defaults `recommended_action: 'delete'`. Placeholder detector for `<TODO>`/`<placeholder>`/`<TBD>` could false-positive on legitimate docs. **Mitigation**: dry-run default; path-scoped allowlist; placeholder rule emits SHOULD-FIX advisory only.
- **HIGH #30**: `sanitizeLogMessage` exists in 2 files. Inconsistent rename → ReferenceError. **Mitigation**: extract to `src/util/sanitize.ts`, import in both, let TypeScript catch misses.
- **MEDIUM #56**: Adding new mode files surfaces latent drift. **Mitigation**: verify each mode file has full telemetry section BEFORE adding to FILES; fix any drift as part of this todo.
- **MEDIUM #44**: 5th reviewer adds ~25% review tokens. **Mitigation**: scope test-quality perspective to fire only when changed files include `*.test.ts` (guard in review.md Step 4).
- **MEDIUM #15**: Hand-curated drift-test list itself drifts. **Mitigation**: parametric over `Object.keys(actionSchema.shape)` reflection.
- **MEDIUM #40**: Default skill scope misses `.mjs`/`.json`/`.jsonl`/`commands/*.md`. **Mitigation**: explicit scope flag in skill input, default covers all text file extensions.
- **LOW #36**: 21+ existing `?? 0` callsites, several legitimate. **Mitigation**: ship rule pack as `.mastracode/rules/nan-safe-numbers.md` (markdown reviewer-hint, not eslint).

## Recommendations

### Recommended Architecture
1. **Extract sanitize + numeric helpers first** (#30, #36). Create `src/util/sanitize.ts` and `src/util/numeric.ts`. Update `workflow-state.ts` + `telemetry.ts` to import. Re-export from `src/index.ts`. Promotes contract testability.
2. **#37 filter-stale**: extend `FilterResult` with 4th bucket `unknown` (preserve boolean `stale` semantics). Empty `diff_hunk` → classify as `unknown` not `stale`. Add `src/__tests__/stale-filter.test.ts` with fixtures.
3. **#15 dual-layer drift test**: parametric, reflection-based. Iterate `recordSubagentAction`, `recordRecallAction`, `saveReviewResultsAction` ZodObjects; for each field, assert presence + regex match in flat schema.
4. **#40 rename-audit skill**: ship as `.mastracode/skills/rename-audit/SKILL.md`. Frontmatter + 5 Steps (find usages, classify by file type, report). Does NOT wire into finalize gate v1 — that's a follow-up.
5. **#44 test-quality reviewer perspective**: add `### Test Quality (test-quality-reviewer)` block to reviewer.ts. Update review.md spawn list (4→5) + telemetry correlationIds. Scope: covers vacuous-mock detection, presence-only assertions, regex over-permissiveness, stale fixtures.
6. **#56 spawn-site expansion**: verify plan.md + triage.md have full telemetry sections (fix any drift inline). Add both to FILES array. Add prose-directive rule pack as `.mastracode/rules/spawn-site-prose-rules.md`.
7. **#42 repo-cleanup**: add 5 gitignore entries (`.planning/**/*-capture-*.md`, `.planning/**/checks-convergence.json`, etc. already covered — focus on telemetry archive + transient phase artifacts). Add placeholder detector function `hasPlaceholderText(content)` returning advisory matches, NOT delete-actions.

### Pack/test deliverables
- NEW `src/util/sanitize.ts` (3 exports + tests)
- NEW `src/util/numeric.ts` (2 exports + tests)
- NEW `.mastracode/skills/rename-audit/SKILL.md`
- NEW `.mastracode/rules/zod-dual-layer-drift.md` (reviewer-hint markdown)
- NEW `.mastracode/rules/input-hygiene.md`
- NEW `.mastracode/rules/nan-safe-numbers.md`
- NEW `.mastracode/rules/spawn-site-prose-rules.md`
- NEW `src/__tests__/dual-layer-schema-drift.test.ts`
- NEW `src/__tests__/stale-filter.test.ts`
- NEW `src/util/sanitize.test.ts`
- NEW `src/util/numeric.test.ts`
- MOD `src/__tests__/spawn-site-invariant.test.ts` (extend FILES)
- MOD `src/review-analysis/stale-filter.ts` (add unknown branch)
- MOD `src/tools/pr-review.ts` (FilterResult shape)
- MOD `src/tools/workflow-state.ts` (import sanitize/numeric)
- MOD `src/state/telemetry.ts` (import sanitize)
- MOD `src/subagents/reviewer.ts` (5th perspective)
- MOD `src/instructions/review.md` (spawn list + telemetry)
- MOD `src/tools/repo-cleanup.ts` (placeholder detector)
- MOD `.gitignore` (transient-artifact globs)

## Open Questions

1. **#44 5th perspective gating**: should test-quality reviewer always fire, or only when changed files include `*.test.ts`? Recommend: always fire (simpler; test-quality findings on non-test PRs are NOTE-level).
2. **#37 backward compat**: should `stale-filter.ts` callers receive a new `unknown` array directly, or should empty-diff_hunk comments be routed to `actionable` (safer default)? Recommend: new `unknown` array — explicit.
3. **#42 placeholder semantics**: what counts as a placeholder? Recommend: `<TODO>`, `<TBD>`, `<placeholder>`, `<FIXME>`, `xxx` in capital letters in markdown. Advisory only.
4. **Skill scoping**: should rename-audit honor `.gitignore`? Recommend: yes (use `git ls-files` for source enumeration).
