# Plan: 8 PR-Feedback Learning Todos

## Objective
Ship 8 PR-feedback learning todos in one PR: filter-stale empty diff_hunk fix (#37), rename-audit skill (#40), Zod drift detector rule pack (#15), input-hygiene helpers + rule pack (#30), NaN-safe rule pack (#36), reviewer test-quality perspective (#44), spawn-site expansion + prose-directive rule pack (#56), repo-cleanup transient + placeholder detector (#42).

## Context
Research found rule-pack infra complete at `src/rule-engine/`, sanitize/numeric helpers duplicated as module-private functions, reviewer has 4 inline perspectives, spawn-site test covers 5 mode files. All 8 todos structurally independent. Working dir: `packages/luca-mastracode/`.

**#56 scope revision (B-1, B-2)**: `plan.md`, `triage.md`, `build.md`, `fast.md`, `discuss.md` do NOT spawn subagents (verified). Expansion target REDUCED to: a NEW non-spawn-site test (`telemetry-prose-directive.test.ts`) that asserts `triage.md` has correct `record-recall` directive form (already present per recall-prose.test.ts) — focus #56 deliverable on the prose-directive rule pack + a NEW assertion that the FILES list in spawn-site-invariant.test.ts is **complete** relative to actual spawn-site mode files (defense against future drift).

## Phases

### Phase 1: Foundation utils (foundation layer)

#### Wave 1: Extract shared utils
- [ ] **Task 1.1.1**: Create `src/util/sanitize.ts` exporting `sanitizeForLog(unknown): string` (200-char cap, strip CR/LF/tab), `sanitizeForStorage(unknown): string` (no cap, strip CR/LF/tab), `displayBounded(unknown, max: number): string` (configurable cap).
  - Files: `src/util/sanitize.ts` (new), `src/util/sanitize.test.ts` (new, ≥6 tests)
  - Verification: `bun test src/util/sanitize.test.ts` passes; all 3 exports + types present.

- [ ] **Task 1.1.2**: Create `src/util/numeric.ts` exporting `finiteOrNull(n: number | null | undefined): number | null` and `clampTokens(n: number | null | undefined, max?: number): number | null` (default max 10_000_000, floor).
  - Files: `src/util/numeric.ts` (new), `src/util/numeric.test.ts` (new, ≥6 tests)
  - Verification: `bun test src/util/numeric.test.ts` passes; both exports present.

- [ ] **Task 1.1.3**: Re-export new utils from `src/index.ts` for public consumers.
  - Files: `src/index.ts`
  - Verification: `grep -E "sanitizeForLog|finiteOrNull" src/index.ts` shows both exports.

#### Wave 2: Migrate callsites to shared utils
- [ ] **Task 1.2.1**: Update `src/tools/workflow-state.ts` to import `sanitizeForLog`/`sanitizeForStorage` from `src/util/sanitize.ts` and `finiteOrNull`/`clampTokens` from `src/util/numeric.ts`. Keep local private aliases as shims to imports (zero call-site touch).
  - Files: `src/tools/workflow-state.ts:106-155` (replace local definitions with imports)
  - Verification: `tsc --noEmit` clean; `bun test src/__tests__/workflow-state-actions.test.ts` passes.

- [ ] **Task 1.2.2**: Update `src/state/telemetry.ts` to import `sanitizeForLog` instead of local duplicate.
  - Files: `src/state/telemetry.ts:62-67`
  - Verification: `tsc --noEmit` clean; `bun test src/__tests__/telemetry.test.ts` passes.

### Phase 2: Subagent + tools changes (independent of Phase 1)

#### Wave 1: Filter-stale 3-way + reviewer perspective + repo-cleanup
- [ ] **Task 2.1.1**: Add `unknown` classification to `src/review-analysis/stale-filter.ts`. Specifically:
  - Extend `StaleReason` union at `:55-59` to include `'empty-diff-hunk'`.
  - Add `unknown: PrReviewComment[]` field to `FilterResult` at `:70-79`.
  - In `verdictFor()` at `:265-337`: if `comment.diff_hunk === ''`, return `{ commentId: comment.id, stale: false, reason: 'empty-diff-hunk', evidence: 'empty diff_hunk — cannot classify' }`.
  - In `filterStaleComments` dispatcher at `:367-379`: route verdicts where `verdict.reason === 'empty-diff-hunk'` AND `verdict.stale === false` into the new `unknown` array (NOT into `actionable`).
  - In `src/tools/pr-review.ts:163-169` return shape: include `unknown: result.unknown` and `unknownCount: result.unknown.length`.
  - In `src/tools/pr-review.ts:156-162` appendLedger payload: add `unknownCount: result.unknown.length`.
  - In `src/tools/pr-review.ts` message template: append ", W unknown" (W = unknownCount).
  - In `src/review-analysis/stale-filter.ts:381` return literal: add `unknown` field.
  - Files: `src/review-analysis/stale-filter.ts`, `src/tools/pr-review.ts`
  - Verification: `bun test src/__tests__/stale-filter.test.ts` (Task 3.1.2) covers all 4 buckets; tsc clean.

- [ ] **Task 2.1.2**: Add 5th `### Test Quality (test-quality-reviewer)` perspective block to `src/subagents/reviewer.ts` after line 43, before `## Severity Classification`. Bullets: vacuous mocks (test passes without exercising code), presence-only assertions (`.toContain` without anchor), regex over-permissiveness (positive-only without negative case), stale fixtures after schema change, test-name-vs-assertion drift. ALSO update line 16 prose "one of four perspectives" → "one of five perspectives".
  - Files: `src/subagents/reviewer.ts`
  - Verification: `grep -n "test-quality-reviewer" src/subagents/reviewer.ts` shows block; `grep -n "five perspectives" src/subagents/reviewer.ts` shows updated prose; tsc clean.

- [ ] **Task 2.1.3**: Update `src/instructions/review.md`: Step 4 spawn list 4→5 reviewers (add Test Quality), `record-subagent` correlationIds list +1 (`reviewer-test-${ts}`), all "4 reviewers" prose → "5 reviewers".
  - Files: `src/instructions/review.md`
  - Verification: `grep -c "reviewer subagent with perspective" src/instructions/review.md` returns 5; spawn-site-invariant test still passes for review.md.

- [ ] **Task 2.1.4**: Add EXPORTED placeholder-detector function `hasPlaceholderText(content: string): {found: boolean, matches: Array<{pattern: string, line: number}>}` to `src/tools/repo-cleanup.ts` near line 139 (next to `isCaptureArtifact`). Patterns: `<TODO>`, `<TBD>`, `<placeholder>`, `<FIXME>`, `XXX` (3+ capital Xs in markdown). Export from module (no tool action wiring v1 — testable as plain fn).
  - Files: `src/tools/repo-cleanup.ts`
  - Verification: function exported (`export function hasPlaceholderText`); 5+ patterns detected in test fixture.

- [ ] **Task 2.1.5**: Append transient-artifact globs to `.gitignore` (de-dup first): `.planning/telemetry/archive/`, `.planning/**/checks-convergence.json`, `.planning/**/*-capture-*.md`, `.planning/audits/memory/state.json`.
  - Files: `.gitignore`
  - Verification: `git check-ignore .planning/telemetry/archive/foo.jsonl` returns 0 status.

#### Wave 2: Skill + rule packs
- [ ] **Task 2.2.1**: Create `.mastracode/skills/rename-audit/SKILL.md` with YAML frontmatter (`name: rename-audit`, multi-line description, trigger phrases "rename audit", "audit renames", "find stale refs"), 5 Steps: (1) Parse args (oldName, newName, optional scope), (2) Enumerate source via `git ls-files`, (3) Grep across .md/.ts/.tsx/.mjs/.json/.jsonl + commands/ + todos/ + ROADMAP, (4) Classify hits by file type (code/test/docs/state), (5) Report findings table. Include prohibition block: NO write operations, NO automatic fixes — read-only audit only.
  - Files: `.mastracode/skills/rename-audit/SKILL.md` (new)
  - Verification: file exists, frontmatter parses (YAML valid), ≥5 `### Step` or `## Step` headers present.

- [ ] **Task 2.2.2**: Create 4 reviewer-hint rule packs at `.mastracode/rules/`:
  - `zod-dual-layer-drift.md` — adding fields to per-action schemas requires mirroring to flat `workflowStateInputSchema` with same constraints (regex/max).
  - `input-hygiene.md` — `sanitizeForLog` for console output, `sanitizeForStorage` for persisted/telemetry fields; never persist `sanitizeForLog` output (truncation collision).
  - `nan-safe-numbers.md` — `finiteOrNull` for durationMs, `clampTokens` for inputTokens/outputTokens; never `?? 0` on optional nullable numerics (collapses unknown with zero).
  - `spawn-site-prose-rules.md` — every subagent spawn site uses inline `// → record-subagent invoke/complete` directive (NOT fenced block); full field enumeration in `<!-- usage: -->` comment (inputTokens, outputTokens, model, success, outcome).
  - Files: 4 new `.md` files in `.mastracode/rules/`
  - Verification: each file has YAML frontmatter with `severity:` field, ≥1 example block, ≥1 "Don't" anti-pattern.

### Phase 3: Tests + changeset

#### Wave 1: New test files
- [ ] **Task 3.1.1**: Create `src/util/sanitize.test.ts` (≥6 tests): sanitizeForLog truncates at 200 + strips CR/LF/tab; sanitizeForStorage no cap + strips CR/LF/tab; displayBounded honors max param; non-string input coerced; null/undefined → empty; empty string preserved.
  - Verification: 6/6 pass.

- [ ] **Task 3.1.2**: Create `src/__tests__/stale-filter.test.ts` (≥6 tests): empty diff_hunk → `unknown` bucket (not stale, not actionable); non-empty + matching anchor → actionable; non-empty + non-matching → stale; reply (in_reply_to_id !== null) → replies bucket; mixed input → all 4 buckets populated; verdict.reason === 'empty-diff-hunk' present in unknown verdicts.
  - Verification: 6/6 pass.

- [ ] **Task 3.1.3**: Create `src/__tests__/dual-layer-schema-drift.test.ts` — parametric over `recordSubagentAction`, `recordRecallAction`, `saveReviewResultsAction`. For each per-action Zod object, iterate `.shape` keys, assert flat `workflowStateInputSchema` contains the field name. For fields with `.regex()` or `.max()` constraints in per-action, assert flat schema has same constraint (introspect via `_def`). Diagnostic message names the action + field.
  - Files: new test file
  - Verification: tests pass against current schemas; injecting drift in throwaway branch fails with diagnostic.

- [ ] **Task 3.1.4**: Extend `src/__tests__/spawn-site-invariant.test.ts`:
  - Add NEW test: assert FILES list is complete relative to mode files that contain `record-subagent` references (use readdirSync + grep). Drift guard.
  - DO NOT add plan.md/triage.md to FILES (verified they don't spawn subagents).
  - Files: `src/__tests__/spawn-site-invariant.test.ts`
  - Verification: existing 5-file tests still pass; new completeness test passes.

- [ ] **Task 3.1.5**: Create `src/util/numeric.test.ts` (≥6 tests): finiteOrNull on number → number; finiteOrNull on NaN → null; finiteOrNull on Infinity → null; finiteOrNull on negative → null; clampTokens floors floats; clampTokens > 10M → null.
  - Verification: 6/6 pass.

- [ ] **Task 3.1.6**: Create `src/__tests__/repo-cleanup-placeholder.test.ts` (≥4 tests): exports `hasPlaceholderText`; detects `<TODO>`, `<TBD>`, `<placeholder>`, `<FIXME>`, `XXX`; returns `found:false` for clean text; returns line numbers correctly.
  - Verification: 4/4 pass.

#### Wave 2: Changeset + integration check
- [ ] **Task 3.2.1**: Create `.changeset/pr-feedback-batch-8-todos.md` (minor bump on `@alecsibilia/luca-mastracode`). Description enumerates all 8 todos with brief one-liner per fix.
  - Files: new changeset
  - Verification: file present at `.changeset/pr-feedback-batch-8-todos.md`; YAML frontmatter valid.

- [ ] **Task 3.2.2**: Full test suite + tsc check. Confirm zero regressions.
  - Verification: `bun test` total green; `bun run tsc --noEmit` clean; baseline 474+ tests pass.

## Verification Criteria
- All 8 todos addressed with file:line evidence in commits
- `bun test` passes (474+ baseline + ~30 new tests)
- `bun run tsc --noEmit` clean
- `bun run lint` no NEW errors
- Stale-filter has 4 buckets (actionable/stale/replies/unknown)
- Reviewer has 5 perspectives
- New rule packs visible in `.mastracode/rules/`
- rename-audit skill discoverable
- `.gitignore` ignores transient artifacts
- Changeset present; PR-ready

## Risks & Mitigations
- **#37 boolean truthiness break** → Mitigated: keep `stale` boolean field; add parallel `unknown` array.
- **#30 sanitize migration ReferenceError** → Mitigated: TypeScript import-time check; shim aliases preserve callsite syntax.
- **#42 placeholder false-positives** → Advisory only; exported function, not wired to delete-action.
- **#44 token cost +25%** → Accepted (always fires); future optimization via gating.
- **#56 mode-file coverage gap** → Inline FILES completeness test catches future drift.

## Deviation Protocol
If a task discovers blocking unknowns, halt and document in EXECUTE-{n}.md; do NOT improvise across waves. Each wave commits atomically.
