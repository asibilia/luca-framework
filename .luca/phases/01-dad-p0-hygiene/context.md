# DAD-P0 — Hygiene & Dangling-Reference Repair — Context (Decisions)

> Trace ID: DAD-P0 · Phase `01-dad-p0-hygiene` · Oversight: full-auto (decisions auto-resolved from research). Source: `research.md` (exhaustive, file:line evidence). **No behavior change intended.**

These decisions are LOCKED for planning/execution. Downstream agents act on them without re-asking.

## Decision 1 — phase-execute Loop A/B excision approach `[auto-resolved]`

The `src/iteration/*` + `context-monitor` machinery in `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts` (§4.5 Suspend/Resume, §6.6 Loop A, §7.5 Loop B, §10.5 Checkpoint Cleanup — ~300 lines) invokes files that **do not exist**, so the prose is already non-executable (every `bun run src/iteration/*.ts` would exit non-zero).

**DECISION: excise the whole machinery (delete-block).** Let harness-fix behavior fall back to the execute-mode's already-correct bounded-convergence gotcha ("same error ≥2 iterations = stalled → escalate; iteration ≥3 without `resolved` = hard stop").

**Rationale:** deleting non-executable prose loses zero working behavior; a half-deleted loop is worse than either extreme. Remove the adjacent orphaned config-field reads that only these blocks consume (`harnessFixIterations`, `c.iteration.default_mode/soft_stop_percent/stale_threshold/promotion_threshold/stall_debate_enabled`, `verifyFixIterations`) together with the machinery. Preserve the surrounding harness-run flow (`luca checks run`).

## Decision 2 — `execute.ts` iterationPlan prose (lines 402-411) `[auto-resolved]`

**DECISION: repair-in-place.** Reword the "Review Iteration Re-entry" subsection to key off the `review → execute` pipeline edge and the reviewer's `audits/<reviewer>.md` files; drop the nonexistent `iterationPlan` field name entirely. Smallest possible diff.

**Rationale:** `iterationPlan` is genuinely absent from `lucaStateSchema` (`packages/luca-core/src/state/schemas.ts:81-139`). The real iteration counters (`reviewIteration`/`maxReviewIterations`) exist but are inert until DAD-P1c wires them, so point prose at the concrete re-entry input that exists today — the `audits/*.md` files — not the (currently never-incremented) counter. Keep the record-recall directive block and every other token in the file intact.

## Decision 3 — `architect` double-definition `[auto-resolved]`

**DECISION: RECONCILE via disambiguation note — do NOT retire.**

`architect.ts` is **LIVE**: registered in `MODES` (`modes/index.ts`), invoked as the sole re-plan path by `phase-execute`/`quick`/`session-plan`/`project-new`, and guarded by `record-recall.test.ts`. Retiring would break tests, the `MODES` manifest, and the re-plan path — a behavior change with no decomposed replacement yet.

Concrete reconcile (no behavior change):
1. Add a dual-surface note to `architect.ts` (header comment + one `>` line at the top of `BODY`) distinguishing the **standalone full-planning mode-agent** (direct re-plan cycles + `quick`/`session-plan`/`project-new`) from the **thin inline `/lu` `architect` *step*** (lightweight synthesis that hands off to the separate `discuss`/`plan`/`plan-review` steps).
2. Align the one-line `/lu` step-table wording in `commands/lu.ts` + `skills/lu/index.ts` so the `architect` *step* row no longer implies it writes `plan.md`.
3. Do NOT restructure the pipeline or the mode body's steps — that is Phase 1+ work.

**Deferred (not this phase):** a true retire/rename is gated on the decomposed discuss/plan/plan-review steps being able to serve the re-plan cycle.

## Decision 4 — Do-not-touch guardrails `[auto-resolved]`

- **Generated `dist/**`** (`packages/luca/dist/claude/**`): never hand-edit — regenerates from `src/` on build. Rebuild instead.
- **Historical / frozen:** `packages/luca/CHANGELOG.md`, `docs/archive/**`, `.luca/archive/**` — leave. (The CHANGELOG entry documents this exact debris as backlogged work; this phase closes it, it doesn't rewrite history.)
- **`record-recall.test.ts` invariants:** keep `architect` + `execute` in `MODES`; do not delete/rename either mode file; keep the record-recall directive tokens.
- **Out of scope:** the parallel `triage` double-definition (spec names only `architect`), and iteration-counter *wiring* (that's DAD-P1c). Do not expand scope.

## Decision 5 — Verification `[auto-resolved]`

- Gate: `bunx --bun tsc --noEmit`.
- Bounded post-edit tests: `timeout 120 bun test packages/luca-tools/src/artifacts/modes/record-recall.test.ts` and `finalize.test.ts`.
- Rebuild so `dist/**` regenerates from the fixed source (confirms the dangling tokens clear downstream).

## Open planner sub-choice (surfaces at confidence gate if low-confidence)

Decision 1's delete-vs-minimal-replace is HIGH confidence toward delete-block (prose is non-executable). No further ambiguity expected; planner proceeds with delete-block unless it finds a live consumer of the excised blocks (none found in research).
