---
id: 02-plan-criteria-quality-gates
title: "PAI criteria quality rules: splitting test, anti-criteria, ID-stability"
revision: 4
waves: 4
tasks: 14
criteria: 31
anti_criteria: 4
verification_gate: "bunx --bun tsc --noEmit"
---

# Plan: Plan-Criteria Quality Gates (REQ-02, milestone v13.0.0-pai-learnings)

## Objective
Adopt PAI's three criteria-quality rules across Luca's plan authoring/review/consumption surfaces: (1) Splitting Test, (2) mandatory anti-criteria, (3) ID-stability with ac-NN.M splits and tombstones. Instruction-body edits + one advisory `luca plan lint` CLI handler. Zero schema changes.

## Context & Decisions (confidence.jsonl wave 0)
- Q1: extend ac-NN; splits = ac-NN.M, parent preserved. Q2: IDs live in plan-level `## Verification Criteria` section; per-task Verification lines reference them.
- Q3: option (b) — `luca plan lint`, warn-only, instruction-invoked. Q4: 150-line budget kept, `## Verification Criteria` section exempt.
- Tombstones: `[DROPPED — see decisions <date>]` stays in plan.md, EXCLUDED from verify.json (verification-result.ts:157-159 stays clean); validate-verification-ref.ts:78-99 exact-match rejection of dropped ids is correct — document it.
- Constraints: phase-01 staged index untouched; never commit; gate = tsc only; runtime probes via source-run runMain (linked binary stale). luca-mastracode mirrors out of scope (non-goal).

## Phases

### Phase 1: criteria quality gates

#### Wave 1: authoring + review + consumption rules (3 distinct files — fully parallel) [AFK]
- [ ] **Task 1.1.1**: Add "Criteria Quality Rules" to architect mode: Splitting Test (one binary tool probe per criterion; and/with compounds split; all/every/complete must enumerate; no-nameable-probe = rewrite, with can-A-pass-while-B-fails judgment test), mandatory ≥1 anti-criterion derived from context.md `### Out of Scope` (discussion.ts:90-91 format), ID-stability (never renumber; splits = ac-NN.M; drops = tombstone `[DROPPED — see decisions <date>]`). Update plan.md template (:184-220) so `## Verification Criteria` carries ac-NN lines + `Anti:` entries and per-task Verification lines reference ac-IDs; amend :38/:396 budget with criteria-section exemption; touch quality rules at :236/:323/:399-400. Pin canonical line grammar: criteria `- **ac-NN**: <one binary probe>` (splits `ac-NN.M`), anti-criteria `- **anti-NN**: MUST NOT — <guard + probe>`.
  - Files: packages/luca-tools/src/artifacts/modes/architect.ts
  - Verification: ac-01, ac-02, ac-03, ac-03.1, ac-04

- [ ] **Task 1.1.2**: Extend plan-reviewer checklist (:64-70) with items 7-9: splitting-test compliance, ≥1 anti-criterion present, ID-stability across revisions (no renumbering vs prior plan.md). Add `G-CRIT-NNN` gap class at :77-81.
  - Files: packages/luca-tools/src/artifacts/subagents/plan-reviewer.ts
  - Verification: ac-05, ac-06

- [ ] **Task 1.1.3**: Rewrite verifier criteria output rules (:58, :83-93): consume plan-authored ac-IDs from `## Verification Criteria`, NEVER mint ids; tombstoned criteria are excluded from the verify.json criteria array (note exclusion rationale inline); sub-ids ac-NN.M pass through as-is (schemas.ts:16 unconstrained — no schema edit).
  - Files: packages/luca-tools/src/artifacts/subagents/verifier.ts
  - Verification: ac-07, ac-07.1, ac-08, anti-01

#### Wave 2: sync surfaces + lint handler (3 distinct file-sets — fully parallel) [AFK]
- [ ] **Task 1.2.1**: Sync phase-plan command brief (:34) and skill architect brief (:304-316) + duplicated reviewer prompt (:385-391): plans carry ac-ID'd criteria, ≥1 anti-criterion, splitting-test wording; downstream_consumer block mentions stable ac-IDs. Also sync verifier-spawn criteria wording at skills/phase-execute/index.ts:1638 and plan-criteria wording at skills/quick/index.ts:131.
  - Files: packages/luca-tools/src/artifacts/commands/phase-plan.ts, packages/luca-tools/src/artifacts/skills/{phase-plan,phase-execute,quick}/index.ts
  - Verification: ac-09, ac-09.1

- [ ] **Task 1.2.2**: Update criteria references in review mode (:71-76) and execute mode (:255) to plan-authored ac-IDs; document in review.ts that done-refs must cite live (non-tombstoned) criterion ids per validate-verification-ref exact-match.
  - Files: packages/luca-tools/src/artifacts/modes/review.ts, packages/luca-tools/src/artifacts/modes/execute.ts
  - Verification: ac-11

- [ ] **Task 1.2.3**: New `luca plan lint` handler, warn-only/advisory (always exit 0; warnings to stdout). Regexes keyed to the Task 1.1.1 grammar: ac-ID per criterion line; ` and `/` with ` compound flag; all/every/complete without enumerated sub-criteria; ≥1 `- **anti-NN**:` line. Full registration surface (luca-confidence-log pattern): (a) handler luca-plan-lint.ts, (b) export from write-surface/index.ts (:42), (c) new noun-group commands/write-surface/plan.ts with `rejectUnknownFlags('plan lint', cmd, rawArgs)` (confidence.ts:158 pattern), (d) cli.ts subCommands entry (:79-86) + commands/write-surface barrel. Judgment checks (probe nameability, A-pass-while-B-fails) stay instruction-side — say so in handler doc comment.
  - Files: packages/luca-cli/src/write-surface/handlers/luca-plan-lint.ts, packages/luca-cli/src/write-surface/index.ts, packages/luca-cli/src/commands/write-surface/{plan.ts,index.ts}, packages/luca-cli/src/cli.ts
  - Verification: ac-10, ac-10.1, ac-12

#### Wave 3: wiring + gate (sequenced — re-edits Wave 1/2 files) [AFK]
- [ ] **Task 1.3.1**: Wire lint invocation: architect Step 5 (run `luca plan lint` before spawning plan-reviewer, address warnings) and phase-plan skill persist step. Note materialization path: edits reach users via build + `luca init` re-run.
  - Files: packages/luca-tools/src/artifacts/modes/architect.ts, packages/luca-tools/src/artifacts/skills/phase-plan/index.ts
  - Dependencies: 1.1.1, 1.2.1, 1.2.3
  - Verification: ac-13, ac-12

- [ ] **Task 1.3.2**: Run gate + constraint sweep: tsc clean; staged phase-01 index byte-identical; no commits, no bun test, no schema or luca-mastracode diffs.
  - Files: none (verification only)
  - Dependencies: all
  - Verification: ac-12, anti-01, anti-02, anti-03, anti-04

#### Wave 4: review fixes — cycle 2 [AFK] (fully parallel — disjoint files after rev-4 rescope)
- [ ] **Task 1.4.1** (MUST-FIX): Stage-gate classifies `luca plan lint` bash-mutate → BLOCKED in PLANNING where architect/phase-plan mandate it. Add `plan: new Set(['lint'])` to LUCA_NOUN_VERBS (:230-248) and `'lint'` to LUCA_READ_VERBS (:217-226). Runtime stage-gate probe impossible from inside the pipeline — verification is structural + classifier unit probe.
  - Files: packages/luca-cli/src/hook/helpers/classify-bash-command.ts
  - Verification: ac-14

- [ ] **Task 1.4.2**: Add explicit phase-agnostic `'plan lint': []` entry to WRITE_COMMAND_PHASES (:67-69) — registry completeness; absence ≠ []. Note: anti-01 guards luca-core/src/verification/ only, so this state/configs edit is legal.
  - Files: packages/luca-core/src/state/configs/step-artifacts.ts
  - Verification: ac-15

- [ ] **Task 1.4.3**: Lint fixes: strip backtick code spans before compound/quantifier tests; add `/i` to COMPOUND_CONNECTIVE; sanitize control chars (newlines/ANSI) in the echoed --file path in warning/summary/error lines; help/description wording "exits 0 on lint findings" (operational errors exit 1). Also fix plan.ts:4-5 header comment — phase-agnostic status now comes from the explicit `[]` WRITE_COMMAND_PHASES entry (1.4.2), not absence.
  - Files: packages/luca-cli/src/write-surface/handlers/luca-plan-lint.ts, packages/luca-cli/src/commands/write-surface/plan.ts
  - Verification: ac-16, ac-17, ac-18, ac-19

- [ ] **Task 1.4.4**: Settle split-parent fate in Rule 3: on split, parent line becomes pointer `- **ac-NN**: [SPLIT → ac-NN.1, ac-NN.2]`, excluded from verify.json like tombstones. Edit set: architect.ts rule sentence + template example; template gains minimal `## Decisions` section (one-line `<date> — <decision>` entries — the destination tombstone text (:240) and lint-deviation justifications (:344) already reference); verifier.ts enumeration note; review.ts done-ref doc clause widened to "live = non-tombstoned, non-split-parent". No lint edit — as-built linter already passes `[SPLIT` pointer lines (.M exemption; no missing-probe check).
  - Files: packages/luca-tools/src/artifacts/modes/architect.ts, packages/luca-tools/src/artifacts/subagents/verifier.ts, packages/luca-tools/src/artifacts/modes/review.ts
  - Verification: ac-20, ac-21, ac-22, ac-26, ac-27

- [ ] **Task 1.4.5**: phase-plan.ts:34 condensed mirror dropped Rule 3 — add ID-stability/tombstone mention; add `luca plan lint` invocation to the command body (inline-orchestrator path lacks pre-review lint).
  - Files: packages/luca-tools/src/artifacts/commands/phase-plan.ts
  - Verification: ac-23, ac-24

- [ ] **Task 1.4.6**: Align skill lint-brief (:363) with architect.ts:344 — restore "do not treat a clean lint as a substitute for review" sentence.
  - Files: packages/luca-tools/src/artifacts/skills/phase-plan/index.ts
  - Verification: ac-25

## Verification Criteria
- **ac-01**: `grep -c "Splitting Test" packages/luca-tools/src/artifacts/modes/architect.ts` ≥ 1.
- **ac-02**: `grep -n "Out of Scope" packages/luca-tools/src/artifacts/modes/architect.ts` hits inside an anti-criteria rule mandating ≥1 anti-criterion per plan.
- **ac-03**: `grep -n "DROPPED" packages/luca-tools/src/artifacts/modes/architect.ts` hits the tombstone rule text.
- **ac-03.1**: `grep -n "ac-NN.M" packages/luca-tools/src/artifacts/modes/architect.ts` hits the split convention (parent ID preserved, never renumber).
- **ac-04**: `grep -n "150" packages/luca-tools/src/artifacts/modes/architect.ts` shows budget line(s) amended with explicit `## Verification Criteria` exemption.
- **ac-05**: `grep -c "G-CRIT" packages/luca-tools/src/artifacts/subagents/plan-reviewer.ts` ≥ 1.
- **ac-06**: `grep -c "anti-criter" packages/luca-tools/src/artifacts/subagents/plan-reviewer.ts` ≥ 1 (checklist item present).
- **ac-07**: `grep -in "never" packages/luca-tools/src/artifacts/subagents/verifier.ts` hits a rule forbidding minting criterion ids.
- **ac-07.1**: `grep -n "plan-authored" packages/luca-tools/src/artifacts/subagents/verifier.ts` hits the rule to consume ac-IDs from plan.md `## Verification Criteria`.
- **ac-08**: `grep -n "DROPPED" packages/luca-tools/src/artifacts/subagents/verifier.ts` hits exclusion rule (tombstoned criteria omitted from verify.json).
- **ac-09**: `grep -l "anti-criter" packages/luca-tools/src/artifacts/commands/phase-plan.ts packages/luca-tools/src/artifacts/skills/phase-plan/index.ts` lists both files.
- **ac-09.1**: `grep -l "ac-" packages/luca-tools/src/artifacts/skills/phase-execute/index.ts packages/luca-tools/src/artifacts/skills/quick/index.ts` lists both files (criteria wording synced at :1638 / :131).
- **ac-10**: source-run (runMain pattern) `luca plan lint .luca/phases/02-plan-criteria-quality-gates/plan.md` exits 0 (warn-only, never blocks).
- **ac-10.1**: detection path — `luca plan lint` against an inline fixture containing a compound ` and ` criterion and zero `- **anti-NN**:` lines emits ≥2 warning lines to stdout and still exits 0.
- **ac-11**: `grep -l "ac-" packages/luca-tools/src/artifacts/modes/review.ts packages/luca-tools/src/artifacts/modes/execute.ts` lists both files.
- **ac-12**: `bunx --bun tsc --noEmit` exits 0.
- **ac-13**: `grep -l "plan lint" packages/luca-tools/src/artifacts/modes/architect.ts packages/luca-tools/src/artifacts/skills/phase-plan/index.ts` lists both files (invocation wired).

### Wave 4 criteria (cycle 2)
- **ac-14**: classifier unit probe — source-run `bun -e` importing classify-bash-command.ts asserts classify of `luca plan lint --file x` returns a read/luca-write category allowed in PLANNING (not bash-mutate).
- **ac-15**: `grep -n "'plan lint'" packages/luca-core/src/state/configs/step-artifacts.ts` hits an entry mapped to `[]`.
- **ac-16**: fixture probe — criterion line whose ` and ` appears only inside backtick code spans emits zero compound warnings.
- **ac-17**: fixture probe — criterion line with uppercase ` AND ` compound (outside backticks) emits a compound warning (case-insensitive connective).
- **ac-18**: source-run lint with a --file path containing a raw ESC byte — stdout/stderr contain no unescaped `\x1b`.
- **ac-19**: `grep -n "exits 0 on lint findings" packages/luca-cli/src/commands/write-surface/plan.ts` hits the help/description text.
- **ac-20**: `grep -n "SPLIT →" packages/luca-tools/src/artifacts/modes/architect.ts` hits Rule 3 parent-pointer sentence (template example included).
- **ac-21**: `grep -n "SPLIT" packages/luca-tools/src/artifacts/subagents/verifier.ts` hits the enumeration note excluding `[SPLIT` pointer lines from verify.json.
- **ac-22**: round-trip fixture probe (mktemp) — full plan containing split parent pointer + `.1`/`.2` children + ≥1 `- **anti-NN**:` line lints to 0 warnings. (rev-3 probe was vacuous against as-built linter — replaced, ID kept.)
- **ac-26**: `grep -c "## Decisions" packages/luca-tools/src/artifacts/modes/architect.ts` goes 0 (pre-state, verified) → ≥1 in the plan.md template block.
- **ac-27**: `grep -n "non-split-parent" packages/luca-tools/src/artifacts/modes/review.ts` hits the widened done-ref liveness clause (:80-82 region).
- **ac-23**: `grep -in "tombstone" packages/luca-tools/src/artifacts/commands/phase-plan.ts` hits the restored Rule 3 (ID-stability) mention.
- **ac-24**: `grep -n "plan lint" packages/luca-tools/src/artifacts/commands/phase-plan.ts` hits the lint invocation in the command body.
- **ac-25**: `grep -n "substitute for review" packages/luca-tools/src/artifacts/skills/phase-plan/index.ts` hits the restored sentence at the lint brief.

### Anti-criteria (regression guards; grammar per Task 1.1.1)
- **anti-01**: MUST NOT change verification core — `git diff --name-only -- packages/luca-core/src/verification/` is empty.
- **anti-02**: MUST NOT disturb staged phase-01 index — `git diff --cached --name-only` identical before/after phase.
- **anti-03**: MUST NOT commit — `git log -1 --format=%H` identical before/after phase; bun-test prohibition is behavioral-only (no probe).
- **anti-04**: MUST NOT touch legacy luca-mastracode mirrors — `git status --porcelain` shows no changes under them.

## Non-Goals (deferred — follow-up todo to be filed)
Refactor-grade items explicitly out of this phase: shared CRITERIA_GRAMMAR constant extraction (artifacts/shared/), lint-brief shared constant, .M-sibling heuristic simplification, plan.ts header trim.

## Risks & Mitigations
- Lint is advisory and instruction-invoked → non-compliant agent can skip; mitigated by plan-reviewer checklist items + follow-up option to promote regexes into stage-gate hook.
- Verifier ID-consumption change ships same phase as authoring change (required — ID-stability breaks end-to-end otherwise); Wave 1 bundles all three surfaces.
- Criteria-section budget exemption may invite padding; G-CRIT reviewer class watches bloat.
