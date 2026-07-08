---
id: dad-p0-hygiene
title: DAD-P0 — Hygiene & dangling-reference repair
trace_id: DAD-P0
complexity: MODERATE
waves:
  - wave: 1
    tasks: [t1, t2, t3, t4]
  - wave: 2
    tasks: [t5]
---

# DAD-P0 — Hygiene & Dangling-Reference Repair

Goal (from roadmap): repair/delete prose referencing nonexistent `src/iteration/*`, `src/memory/context-monitor.ts`, and the nonexistent state field `iterationPlan`; resolve the `architect` double-definition; **no behavior change**, tests green. Decisions locked in `context.md`; evidence in `research.md`.

## Tasks

### Wave 1 — Source edits (file-independent, parallel)

- **t1 — Excise dead-toolkit machinery** in `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts`. Remove §4.5 Suspend/Resume `context-monitor.ts` invocation, §6.6 Loop A, §7.5 Loop B budget bits, §10.5 Checkpoint Cleanup, and the orphaned config-field reads only those blocks consume (`harnessFixIterations`, `c.iteration.*`, `verifyFixIterations`). Preserve the `luca checks run` harness flow and the execute-mode bounded-convergence guidance. Keep the template literal parseable.
  Verification: ac-01, ac-02, ac-14, anti-01

- **t2 — Repair `iterationPlan` prose** in `packages/luca-tools/src/artifacts/modes/execute.ts` (~lines 402-411). Reword "Review Iteration Re-entry" to key off the `review → execute` edge + the reviewer's `audits/<reviewer>.md`; drop the `iterationPlan` field name. Leave the record-recall directive block untouched.
  Verification: ac-03, ac-04

- **t3 — Reconcile `architect` double-definition** in `packages/luca-tools/src/artifacts/modes/architect.ts`. Add a dual-surface disambiguation note (header comment + one `>` line at top of `BODY`) distinguishing the standalone full-planning mode-agent from the thin inline `/lu` `architect` *step*. The note MUST contain the pinned literal marker string `dual-surface: standalone mode-agent vs. /lu architect step` (so ac-05 checks a fixed token). Do NOT delete or restructure.
  Verification: ac-05, ac-06, ac-07, anti-02

- **t4 — Align `/lu` step-table wording** in `packages/luca-tools/src/artifacts/commands/lu.ts` and `packages/luca-tools/src/artifacts/skills/lu/index.ts` (one line each) so the `architect` *step* row no longer implies it writes `plan.md`.
  Verification: ac-08, ac-09

### Wave 2 — Rebuild + verification (serial)

- **t5 — Rebuild + gate.** Rebuild so `dist/**` regenerates from fixed source (do NOT hand-edit `dist/**`). Run the gate and bounded tests; confirm dangling tokens cleared downstream.
  Verification: ac-10, ac-11, ac-12, ac-13, anti-03, anti-04

## Verification Criteria

- **ac-01**: `grep -rn "src/iteration\|context-monitor" packages/luca-tools/src/artifacts/skills/phase-execute/index.ts` returns 0 matches.
- **ac-02**: `grep -c "luca checks run" packages/luca-tools/src/artifacts/skills/phase-execute/index.ts` ≥ 1 (harness flow preserved).
- **ac-03**: `grep -c "iterationPlan" packages/luca-tools/src/artifacts/modes/execute.ts` = 0.
- **ac-04**: `grep -c -- "--kind recall\." packages/luca-tools/src/artifacts/modes/execute.ts` ≥ 1 (record-recall directive intact).
- **ac-05**: `grep -F "dual-surface: standalone mode-agent vs. /lu architect step" packages/luca-tools/src/artifacts/modes/architect.ts` matches (the pinned disambiguation marker is present).
- **ac-06**: `grep -c "export const architectMode\|architectMode =" packages/luca-tools/src/artifacts/modes/architect.ts` ≥ 1 (the export survives).
- **ac-07**: `grep "architect" packages/luca-tools/src/artifacts/modes/index.ts` shows `architect` still in the `MODES` array.
- **ac-08**: the single line describing the `architect` pipeline step in `commands/lu.ts` does not contain the substring `plan.md`.
- **ac-09**: the single line describing the `architect` pipeline step in `skills/lu/index.ts` does not contain the substring `plan.md`.
- **ac-10**: `bunx --bun tsc --noEmit` exits 0.
- **ac-11**: `timeout 120 bun test packages/luca-tools/src/artifacts/modes/record-recall.test.ts` passes.
- **ac-12**: `timeout 120 bun test packages/luca-tools/src/artifacts/modes/finalize.test.ts` passes.
- **ac-13**: after rebuild, `grep -rn "src/iteration\|context-monitor\|iterationPlan" packages/luca/dist/claude` returns 0 (dangling tokens cleared downstream).
- **ac-14**: `grep -c "harnessFixIterations\|c\.iteration\.\|verifyFixIterations" packages/luca-tools/src/artifacts/skills/phase-execute/index.ts` = 0 (orphaned config-field reads removed).
- **anti-01**: MUST NOT edit `packages/luca/CHANGELOG.md`, `docs/archive/**`, or `.luca/archive/**` — `git diff --name-only` lists none of these paths. (`packages/luca/dist/**` is gitignored per `.gitignore:6`, so it never appears in the diff regardless; ac-13 is its real check.)
- **anti-02**: MUST NOT remove `architect`/`execute` from `MODES` or delete/rename either mode file — ac-11 (record-recall.test.ts) green proves it.
- **anti-03**: MUST NOT modify the `triage` double-definition — `git diff --name-only` does not list `packages/luca-tools/src/artifacts/modes/triage.ts`.
- **anti-04**: MUST NOT wire iteration counters (DAD-P1c scope) — `git diff --name-only` lists no file under `packages/luca-core/` (counter increment/assign logic would land in `luca-core/src/state/**`).

## Deliverables

- **D1**: Dangling refs repaired/deleted (`src/iteration/*`, `context-monitor.ts`, `iterationPlan`) → ac-01, ac-03, ac-13
- **D2**: `architect` double-definition resolved (reconcile, documented) → ac-05, ac-06, ac-07, ac-08, ac-09
- **D3**: No behavior change; tests + gate green → ac-02, ac-04, ac-10, ac-11, ac-12

## Notes / Decisions (locked)

- Excision approach = delete-block (prose is non-executable; zero behavior loss).
- `architect` = reconcile, NOT retire (it's live: MODES + 4 skills + record-recall.test.ts). Retire/rename deferred to a later phase.
- Do-not-touch + out-of-scope enforced by anti-01/02/03.
