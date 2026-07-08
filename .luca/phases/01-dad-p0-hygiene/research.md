# DAD-P0 — Hygiene & Dangling-Reference Repair — Research

> Trace ID: DAD-P0 · Phase `01-dad-p0-hygiene` · Spec anchor `d35ae81` · No behavior change intended.

## Summary

Phase 0 is pure prose hygiene against the v13 artifact tree — no state-machine, CLI, or schema logic changes. Two concrete drifts are in scope, both confirmed against live source: (1) mode/skill prose that references a nonexistent `src/iteration/*` CLI subsystem, `src/memory/context-monitor.ts`, and the nonexistent state field `iterationPlan`; and (2) the `architect` "double-definition" — a 465-line standalone `architectMode` artifact whose body describes the *whole* monolithic planning flow (branch → discuss → roadmap → plan → plan-review) while the modernized `/lu` pipeline treats `architect` as a thin inline synthesis step and delegates discuss/plan/plan-review to their own steps. Critically, `architectMode` is **live, not dead** (registered in `MODES`, invoked by three skills as the sole re-plan path, and guarded by a passing test), so the sanctioned resolution is **reconcile/disambiguate, not retire**. Only two source files carry dangling `src/iteration`/`iterationPlan`/`context-monitor` tokens (`modes/execute.ts`, `skills/phase-execute/index.ts`); all other hits are generated `dist/**` or historical `CHANGELOG`/`archive`. The verification gate is `bunx --bun tsc --noEmit`; no `.test.ts` references any of the three tokens, so token repair cannot break a test by string match — the only test constraint is `record-recall.test.ts` (must keep `architect`/`execute` as modes and preserve their record-recall directive tokens).

## Criterion 1 — Dangling references (exhaustive map)

Repo-wide grep for `iterationPlan`, `src/iteration`, `context-monitor` (and `context-monitor.ts`). Classified by surface. **Only rows tagged `source` are editable in Phase 0.**

### Source (editable) — `packages/*/src/**`

| file:line | Offending text (verbatim / paraphrased) | Token | Recommended action |
|---|---|---|---|
| `packages/luca-tools/src/artifacts/modes/execute.ts:402` | `` - `iterationPlan` — if set, this is a **review iteration** (see below). `` | `iterationPlan` | repair-prose: drop the field reference; the review-iteration signal is the `review → execute` pipeline edge + the `audits/<reviewer>.md` files, not a state field |
| `packages/luca-tools/src/artifacts/modes/execute.ts:407` | ``When `iterationPlan` is present in workflow state, you are re-entering from **Review mode**…`` | `iterationPlan` | repair-prose: reword to "When re-entering from **Review** (the `review → execute` edge)…" |
| `packages/luca-tools/src/artifacts/modes/execute.ts:409` | ``1. **Read `iterationPlan`** from state — focused list of fixes from the reviewer.`` | `iterationPlan` | repair-prose: replace with "Read the reviewer's `audits/<reviewer>.md` for the focused must-fix list" (step 2 already says this — collapse the two) |
| `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:406` | `CONTEXT_JSON=$(bun run src/memory/context-monitor.ts --project-dir=. …)` | `context-monitor` | delete-block: nonexistent file; part of §4.5 Suspend/Resume — see note below |
| `.../phase-execute/index.ts:574` | "This loop uses decision-support utilities from `src/iteration/`…" | `src/iteration` | delete-block: anchor sentence of §6.6 Loop A |
| `.../phase-execute/index.ts:626` | `BUDGET=$(bun run src/iteration/budget.ts create …)` | `src/iteration` | delete-block (§6.6.1) |
| `.../phase-execute/index.ts:654` | `BUDGET_CHECK=$(bun run src/iteration/budget.ts should-start …)` | `src/iteration` | delete-block (§6.6.2 Step A) |
| `.../phase-execute/index.ts:666` | `CLASSIFIED=$(bun run src/iteration/classifier.ts …)` | `src/iteration` | delete-block (§6.6.2 Step B) |
| `.../phase-execute/index.ts:690` | `ARTIFACT_DELTA=$(bun run src/iteration/checkpoint.ts artifact-delta …)` | `src/iteration` | delete-block (§6.6.2 Step C) |
| `.../phase-execute/index.ts:693` | `CONVERGENCE=$(bun run src/iteration/convergence.ts …)` | `src/iteration` | delete-block (§6.6.2 Step C) |
| `.../phase-execute/index.ts:732` | `COMMIT_HASH=$(bun run src/iteration/checkpoint.ts commit-hash)` | `src/iteration` | delete-block (§6.6.2 Step D) |
| `.../phase-execute/index.ts:737` | `bun run src/iteration/checkpoint.ts create --record="$RECORD"` | `src/iteration` | delete-block (§6.6.2 Step D) |
| `.../phase-execute/index.ts:772` | `bun run src/iteration/checkpoint.ts rollback …` | `src/iteration` | delete-block (§6.6.2 Step E) |
| `.../phase-execute/index.ts:824` | `BUDGET=$(bun run src/iteration/budget.ts advance …)` | `src/iteration` | delete-block (§6.6.2 Step G) |
| `.../phase-execute/index.ts:1102` | `VERIFY_BUDGET=$(bun run src/iteration/budget.ts create …)` | `src/iteration` | delete-block (§7.5.1 Loop B) |
| `.../phase-execute/index.ts:1652` | `bun run src/iteration/checkpoint.ts prune --phase={phase_number}` | `src/iteration` | delete-block (§10.5 Checkpoint Cleanup) |

### Generated (DO NOT edit — regenerated from `src/` by the build; `luca init` re-materializes)

| file | Note |
|---|---|
| `packages/luca/dist/claude/skills/phase-execute/SKILL.md` | Emitted from `phase-execute/index.ts`. Will clear automatically once source is fixed and rebuilt. |
| `packages/luca/dist/claude/.claude/agents/execute.md` | Emitted from `modes/execute.ts`. Same. |

### Historical (LEAVE — with reason)

| file:line(s) | Reason to leave |
|---|---|
| `packages/luca/CHANGELOG.md:241, 946` | Release history. The entry itself *documents* this debris: "Remaining v12 debris (the `src/iteration/*` subsystem embedded in `phase-execute`…) is tracked in the MuninnDB backlog." Editing changelog history is wrong; this phase *is* the backlogged cleanup. |
| `docs/archive/**` (many hits: `iteration-integration-spec.md`, `open-questions-resolved.md`, `workflow-redesign/*`, `memory-system/*`, `architecture/*`, etc.) | Frozen historical design docs under `docs/archive/`. Out of scope; not shipped artifacts. |
| `.luca/archive/00-legacy-planning/**` (ledger `.jsonl`, `luca-state.json`, phase `REVIEW-1.md`) | Frozen legacy-planning run snapshots — `iterationPlan:[]` appears as recorded *event data* from old runs, not as a live instruction. Archive is never resurfaced (per `.luca/` contract). |

### Schema cross-check (confirms `iterationPlan` is genuinely absent; names the real fields)

Read `packages/luca-core/src/state/schemas.ts:81-139` (`lucaStateSchema`) end-to-end. There is **no `iterationPlan` field**. The `--- Iteration tracking ---` block (lines 116-120) declares the real counters:

- `checksFixIteration`, `verifyIteration`, `planReviewIteration`, `researchReviewIteration`, `reviewIteration` (all `z.number().default(0)`)
- caps (lines 123-128): `maxChecksFixIterations` (3), `maxVerifyIterations` (2), `maxPlanReviewIterations` (2), `maxResearchReviewIterations` (2), `maxReviewIterations` (2), `maxPhases` (5)

So any repaired execute-mode prose that wants a real "review iteration" signal should reference `reviewIteration` / `maxReviewIterations` (which execute.ts already cites correctly at lines 403 and in its gotcha) and the `audits/<reviewer>.md` files — **never** `iterationPlan`. Note the determinism audit's caveat: those counters are schema-declared but never incremented in code today (wiring them is Slice 1 / DAD-P1c, out of scope here) — so Phase 0 should point prose at the audit files as the concrete re-entry input, not lean on the (currently inert) counter.

**Scope flag for the executor (important):** the `src/iteration`/`context-monitor` hits in `phase-execute/index.ts` are not stray lines — they anchor an entire ~300-line nonexistent-toolkit machinery: §4.5 Suspend/Resume (context-monitor), §6.6 "Loop A: Harness Fix Loop" (budget/classifier/convergence/checkpoint), §7.5 "Loop B: Verify Fix" budget init, and §10.5 "Checkpoint Cleanup." Because the referenced `bun run src/iteration/*.ts` / `src/memory/context-monitor.ts` files do not exist, this prose is already non-executable (every invocation would exit non-zero), so removing it loses no working behavior — consistent with "no behavior change intended." The same blocks reference adjacent nonexistent config fields (`c.complexity?.matrix?.[level]?.harnessFixIterations`, `c.iteration?.default_mode/soft_stop_percent/stale_threshold/promotion_threshold/stall_debate_enabled`, `verifyFixIterations`) — these are not among the three assigned tokens but belong to the same debris subsystem and should be removed together with it (a half-deleted loop is worse than either extreme). The minimal, honest repair is to **excise the whole Loop A/Loop B/checkpoint machinery** and let the harness-fix behavior fall back to the already-correct convergence prose the execute *mode* carries in its gotcha ("same error ≥2 iterations = stalled → escalate; iteration ≥ 3 without `resolved` = hard stop"). This is the single largest diff in the phase and should be an explicit planner decision (delete-block vs. minimal in-line replacement); flagging rather than silently choosing.

## Criterion 2 — `architect` double-definition

### What the two definitions are

- **Definition A — the standalone `architectMode` artifact.** `packages/luca-tools/src/artifacts/modes/architect.ts` (465 lines). Its `BODY` describes the *entire* monolithic planning flow: Step 1 Establish Feature Branch, Step 2 Discussion (spawns the `discussion` subagent, writes `context.md`), Step 2.5 Read Research, Step 3 Roadmap Creation (`luca roadmap write`), Step 4 Plan Creation (writes `plan.md`), Step 4.5 Architectural Quality Check, Step 5 Plan Review (spawns `plan-reviewer`, writes `plan-review.md`), Step 6 Submit. Header comment (lines 2-3): "architect mode-agent — Luca Steps 4-7g: git setup, roadmap, plan, plan review." Exported as `architectMode = defineAgent({ id: 'architect', stage: 'architect', … })` (line 473).
- **Definition B — the inline `/lu` pipeline `architect` step.** `packages/luca-tools/src/artifacts/commands/lu.ts:58` (and the mirror in `skills/lu/index.ts:110`): the `architect` step is `"Lightweight synthesis: read research + context, confirm the plan-ready brief. Advance to plan."` The canonical pipeline (`packages/luca-core/src/state/constants.ts:6-20`) makes `discuss`, `architect`, `plan`, `plan-review` **four separate steps**; `pipeline-transitions.ts` gives `architect: ['plan']`, and `STEP_ARTIFACTS.architect = []` (writes nothing). So in the modernized pipeline, everything Definition A's body claims to do (discuss/roadmap/plan/plan-review) is owned by *other* steps, and `/lu` never spawns `architectMode` — it does the synthesis inline.

The collision: one `architect` name, two irreconcilable role descriptions — a monolithic planner vs. a thin no-write synthesis handoff.

### Is `architectMode` dead or live? — LIVE (evidence)

Grep of `packages/**/src/**` for `architectMode` / "architect mode-agent":

1. **Registered/materialized.** `packages/luca-tools/src/artifacts/modes/index.ts:18` imports it, `:32` re-exports it, and `:50` includes it in the `MODES` array — "the source the artifact manifest pulls from." So it is emitted as a `.claude/agents/architect.md` artifact.
2. **Invoked as the sole re-plan path.** `skills/phase-execute/index.ts:34`: "For 'plan a fix' cycles: **re-invoke the architect mode-agent** (which performs planning in v13 — the v12-era `lu-planner` subagent was dropped…)." `skills/quick/index.ts:90,102`: "**MANDATORY**: Invoke the architect mode-agent… Then spawn the architect mode-agent." `skills/session-plan/index.ts:55`: "Spawn the `architect` mode-agent (v13 does planning/prioritization work through the architect)." `skills/project-new/index.ts:503` relies on "the architect mode-agent's branch-establishment flow."
3. **Independently corroborated by the spec.** Synthesis doc 09 §Part 2 table (`architect` row) and §"Genuinely missing research": "Doc 06 confirms `architectMode` *is* invoked (the only live re-plan path)." Design doc 00 line 62 lists "resolve the `architect` double-definition" as Phase 0, independent of XState.
4. **Test guard.** `packages/luca-tools/src/artifacts/modes/record-recall.test.ts:26` hard-codes `MODES = ['triage', 'architect', 'execute', 'review', 'finalize']` and asserts each carries the record-recall directive tokens. Deleting `architect.ts` (or dropping it from `MODES`) fails this test → violates Criterion 3.

### Recommendation: RECONCILE (disambiguate) — do NOT retire

Retiring (delete + drop registration) is **not viable in Phase 0**: it would (a) fail `record-recall.test.ts`, (b) break the `MODES` manifest, and (c) break the re-plan path used by `phase-execute`, `quick`, `session-plan`, and `project-new` — a behavior change, and there is no decomposed re-plan replacement to fall back on yet. A true retire/rename is correctly a *later*-phase decision that must wait until the decomposed discuss/plan/plan-review steps can serve the re-plan cycle (synthesis doc 09 explicitly flags the retire-or-rename as needing that precondition).

Concrete no-behavior-change reconcile for Phase 0:
1. **Add a disambiguation note to `architect.ts`** (in the header comment and/or a one-line `> Note:` at the top of `BODY`) stating the mode's dual surface: it is the **standalone full-planning mode-agent** invoked directly for re-plan cycles and by the `quick`/`session-plan`/`project-new` skills — distinct from the **`/lu` pipeline `architect` *step*** (a lightweight inline synthesis that hands off to the separate `discuss`/`plan`/`plan-review` steps). This makes the collision intentional-and-documented instead of silent drift.
2. **Align the two prose surfaces** so they don't contradict: the `/lu` step-table row (`lu.ts:58`, `skills/lu/index.ts:110`) should note that the full planning work lives in the downstream steps (and, for re-plan, in the architect mode-agent), so a reader doesn't expect the `architect` *step* to write `plan.md`. This is a one-line wording touch on already-editable prose.
3. **Do not restructure the pipeline or the mode body's steps** — that is Phase 1+ work.

Consumers that would break on deletion (must be preserved): `modes/index.ts` (`MODES`), `record-recall.test.ts`, and skills `phase-execute`, `quick`, `session-plan`, `project-new`.

**Note on the parallel triage collision:** the determinism audit (doc 01, Part 4 item 2) also foregrounds a *triage* double-definition (`modes/triage.ts` vs. inline `/lu` triage) with the identical structural shape. It is **out of scope** for this phase (the frozen Phase 0 spec names only `architect`), but the executor should not "helpfully" also touch `triage.ts` — flag it as follow-up, don't expand scope.

## Criterion 3 — Test / verification surface

- **Verification gate:** `bunx --bun tsc --noEmit` (project-standard Luca gate; `bun test` is NOT auto-run by the pipeline). All edits here are inside template string literals (`BODY = \`…\``) in `.ts` files, so type-checking is essentially "does the string still parse" — low risk. Preserve backtick/`${}` escaping when deleting blocks.
- **`luca-tools` tests — confirmed nuance.** Project memory says "luca-tools has no tests," but that is stale for this directory: `packages/luca-tools/src/artifacts/modes/` contains `record-recall.test.ts` and `finalize.test.ts`. `record-recall.test.ts` is the **binding constraint** for both touched-file edits:
  - It requires `architect` and `execute` to remain in `MODES` and to keep the record-recall directive tokens (`luca telemetry emit`, `--kind recall.`, `--run-id`, `query`, `resultCount`, `verifiedCount`, `vault`, `callerMode`, `durationMs`, `recalledIds`). The `iterationPlan` lines in `execute.ts` (402-411) are a *separate* section from the record-recall directive, so repairing them is safe — but the executor must not delete the record-recall block by accident.
  - It reads mode bodies by filename, so `architect.ts` must not be deleted/renamed.
- **No `.test.ts` anywhere references `iterationPlan`, `src/iteration`, or `context-monitor`** (grep over `**/*.test.ts` → zero matches). Therefore the Criterion 1 repairs cannot break a test via string assertion. `phase-execute/index.ts` has no dedicated test at all, so deleting its Loop A/B machinery has no test coupling.
- **Recommended bounded post-edit check:** `timeout 120 bun test packages/luca-tools/src/artifacts/modes/record-recall.test.ts` plus `finalize.test.ts`, then the gate `bunx --bun tsc --noEmit`. Run tests deliberately/bounded per project convention — never via an unbounded agent gate.

## Recommended execution approach (ordered, minimal-diff, no behavior change)

1. **`modes/execute.ts` (lines 402-411) — repair `iterationPlan` prose.** Reword the three offending lines so the "Review Iteration Re-entry" subsection keys off the `review → execute` pipeline edge and the reviewer's `audits/<reviewer>.md` (which the subsection *already* instructs reading at line 410), and drop the `iterationPlan` field name entirely. Keep the record-recall directive and every other token intact. Smallest possible diff.
2. **`skills/phase-execute/index.ts` — excise the nonexistent-toolkit machinery.** Remove §4.5 Suspend/Resume's `context-monitor.ts` invocation (406-408), §6.6 Loop A (≈570-849), §7.5 Loop B budget bits (≈1100-1108 and any `src/iteration` there), and §10.5 Checkpoint Cleanup (1646-1655), together with the adjacent orphaned config-field reads they depend on. Preserve the surrounding harness-run flow (`luca checks run`) and the execute-mode-style bounded-convergence guidance. This is the one place to get explicit planner sign-off on delete-vs-minimal-replace before executing.
3. **`modes/architect.ts` — reconcile the double-definition** by adding the dual-surface disambiguation note (header comment + one `>` line in `BODY`); do not delete, do not restructure steps.
4. **`commands/lu.ts` + `skills/lu/index.ts` — one-line wording alignment** so the `architect` *step* row no longer implies it does the planning writes.
5. **Rebuild + gate:** run the build so `dist/**` regenerates from the fixed source (do NOT hand-edit `dist/**`), then `bunx --bun tsc --noEmit`, then the two bounded mode tests.

## Risks / things not to touch

- **Generated `dist/**` — never hand-edit.** `packages/luca/dist/claude/skills/phase-execute/SKILL.md` and `packages/luca/dist/claude/.claude/agents/execute.md` carry the same dangling tokens but are build output; they clear when source is fixed and the build reruns. Editing them directly is silently overwritten (per the generated-file guard) and is a wasted, misleading diff.
- **Historical `CHANGELOG.md` and `docs/archive/**` / `.luca/archive/**` — leave.** These are release history and frozen snapshots. The CHANGELOG entry (241, 946) explicitly documents this exact debris as backlogged work — this phase closes that backlog item; it does not rewrite the record of it.
- **`record-recall.test.ts` invariants** — do not remove `architect`/`execute` from `MODES`, do not delete either mode file, and do not strip their record-recall directive tokens. This is the one way a "prose-only" edit could go red.
- **Scope creep guard:** the parallel `triage` double-definition and the (inert) iteration-counter *wiring* (DAD-P1c) are explicitly out of Phase 0. Do not fix them here.
- **Escaping:** all edits are inside template literals — keep `` \` ``, `\\`, and `${…}` escaping correct when deleting large blocks, or the `.ts` will fail to parse (caught by `tsc`).

## Confidence

- **Criterion 1 (dangling refs map + schema cross-check):** HIGH. Grep-exhaustive over the repo; source vs. generated vs. historical verified by path; `lucaStateSchema` read directly (no `iterationPlan`; real fields enumerated at `schemas.ts:116-128`).
- **Criterion 2 (`architect` live, reconcile-not-retire):** HIGH. Live status triangulated from `modes/index.ts` registration, four skill call-sites, `record-recall.test.ts`, and the synthesis doc's independent confirmation. The scoping caveat on the phase-execute deletion size (delete-vs-replace) is the one genuinely judgment-dependent item, flagged for planner decision (MEDIUM on that sub-choice only).
- **Criterion 3 (test/verify surface):** HIGH. Gate confirmed as `tsc --noEmit`; zero `.test.ts` token matches; the `record-recall.test.ts` constraint read in full.
