---
id: 02-budget-wiring
title: "Budget wiring: statusline cost sidecar bridge + guard into /lu loop & phase-execute + config docs"
wave: 2
tasks: 4
---

# Plan: budget-wiring — statusline cost sidecar bridge, /lu + phase-execute guard wiring, config docs

## Objective
Phase 2 = issue #319 changes 6–9. Bridge statusline cost → sidecar the Phase-1 guard reads; wire `luca budget check` into the /lu loop (both surfaces) and phase-execute waves; document the config overrides. Phase 1 (budget-core CLI + evaluator + sidecar reader) already landed — this phase only wires it in. Design LOCKED; transcription, no re-derive.

## Context
- Phase 1 done: `luca budget check` prints `{status,tripped,signals}`, always exit 0; reads sidecar `<projectDir>/.claude/cache/luca-usage-signal.json` whose reader (`budget.ts` `UsageSidecarSchema`) consumes ONLY `{totalCostUsd, updatedAt}`.
- Cost reachable ONLY via statusline (`cost.total_cost_usd`) — hooks/orchestrator tools get no cost field. Statusline is the sole producer of the cost dimension.
- Anchors verified: `handler.ts` `StatuslinePayload.cost` 86-89 (only `total_lines_added/removed`); `main()` 292-319, `used`/`limit` at 307-308, insert after 308. `skills/lu/index.ts` loop 98-104, Oversight 251-263. `commands/lu.ts` loop 46-52, Oversight 89-95. `phase-execute/index.ts` wave boundary line 402; doc `orchestrator-context-pruning.md` EXISTS (ref at 501 is live — no fix needed).

## Phases

### Phase 1: budget-wiring

#### Wave 1: statusline cost sidecar bridge (tracer bullet — real code, proves cost signal reaches Phase-1 reader)
- [ ] **Task 1.1.1**: In `handler.ts` add `total_cost_usd?: number` + `total_duration_ms?: number` to `StatuslinePayload.cost` (86-89), THEN after line 308 add a best-effort, try/catch-swallowed, mkdir-recursive write of `<projectDir>/.claude/cache/luca-usage-signal.json = {schemaVersion:1, totalCostUsd, updatedAt}` (minimal shape matching the reader — do NOT thread context fields). Write must NEVER throw (statusline must not crash harness).
  - Files: packages/luca-tools/src/statusline/handler.ts
  - Verification: ac-01, ac-02, ac-03, ac-04, anti-02

#### Wave 2: instruction-body wirings (prose edits — depends on Wave 1 tracer)
- [ ] **Task 1.2.1**: Wire `luca budget check` into the /lu loop on BOTH surfaces in sync (`skills/lu/index.ts` + `commands/lu.ts`): insert a "step 1a" after read-state — run `luca budget check --complexity <level>`, parse `.status`; `ok`→continue, `warn`→note once + keep going, `halt`→do NOT advance, run checkpoint-and-pause (persist resumable `session:*` handoff to repo vault + `tripped` + next action, emit `luca telemetry emit --kind budget.halt --run-id <RUN_ID> --meta ...`, surface paste-ready resume msg). Add Oversight bullet: budget guard is the one always-on stop firing even in `full-auto`.
  - Files: packages/luca-tools/src/artifacts/skills/lu/index.ts, packages/luca-tools/src/artifacts/commands/lu.ts
  - Verification: ac-01, ac-05, ac-06, ac-07, ac-08, anti-03
  - Dependencies: Task 1.1.1
- [ ] **Task 1.2.2**: Wire `luca budget check` into phase-execute at the wave boundary (`index.ts` line 402): alongside the existing context self-assessment, run the check; on `halt` reuse the EXISTING suspend path (append `execute/progress.jsonl`, emit `phase.suspend` with `reason:"budget_halt"`) to checkpoint at the wave boundary and stop — never mid-wave. No doc-ref change.
  - Files: packages/luca-tools/src/artifacts/skills/phase-execute/index.ts
  - Verification: ac-01, ac-09, ac-10
  - Dependencies: Task 1.1.1
- [ ] **Task 1.2.3**: Document the optional `.luca/config.json` `budget` overrides (`maxWallClockMs`, `maxToolCalls`, `softCostCeilingUsd`) in the config surface, with 0/positive semantics (per Phase-1 schema: `maxWallClockMs` positive-finite; `maxToolCalls`/`softCostCeilingUsd` nonneg-finite; 0 disables the soft dimensions).
  - Files: docs/getting-started.md
  - Verification: ac-11
  - Dependencies: Task 1.1.1

## Risks & Mitigations
- **Dual-surface drift** (pattern: dual-lu-surface-sync): skill + command loops must stay identical. Mitigation: single task edits both; anti-03 grep asserts both carry the step-1a phrase.
- **Headless statusline render** (open question from #319): statusline may not render in fully headless runs → cost sidecar stale/absent. Mitigation: cost is best-effort only; wall-time (Phase-1, deterministic) is the guaranteed trip wire; bridge write is additive.
- **Halt mid-flight**: only fires at clean boundaries (top-of-loop for /lu, wave boundary for phase-execute) — `state.json` already resumable via Step 0, no mid-flight artifact write.

## Decisions
- 2026-07-17 — Two waves: Wave 1 isolated real code (handler.ts), Wave 2 pure instruction prose; Wave 2 depends on Wave 1 so the cost producer ships before the loops advertise the consumer path.
- 2026-07-17 — Sidecar write is minimal `{schemaVersion:1, totalCostUsd, updatedAt}`; extra fields are inert (reader ignores them) — Phase-1 review already removed context fields as dead surface.
- 2026-07-17 — DELTA-3: `orchestrator-context-pruning.md` exists; phase-execute edit is pure guard wiring, NOT a dangling-ref fix.
- 2026-07-17 — Halt only at clean step/wave boundaries; guard is advisory instruction, honored by LLM-followed skill bodies (hard enforcement out of scope).

## Deliverables
- **D1**: Statusline cost sidecar bridge (change 6) → ac-02, ac-03, ac-04
- **D2**: /lu loop guard wiring on BOTH surfaces (change 7) → ac-05, ac-06, ac-07, ac-08
- **D3**: phase-execute wave guard wiring (change 8) → ac-09, ac-10
- **D4**: Config-override docs (change 9) → ac-11

## Verification Criteria
- **ac-01**: `bunx --bun tsc --noEmit` exits 0.
- **ac-02**: `grep -q 'total_cost_usd' packages/luca-tools/src/statusline/handler.ts` succeeds (exit 0).
- **ac-03**: `grep -q 'luca-usage-signal.json' packages/luca-tools/src/statusline/handler.ts` succeeds (exit 0).
- **ac-04**: Piping a JSON payload that sets `cost.total_cost_usd` plus `workspace.project_dir=<tmpdir>` into `bun packages/luca-tools/src/statusline/handler.ts` writes `<tmpdir>/.claude/cache/luca-usage-signal.json` containing key `totalCostUsd` (`grep -q totalCostUsd` on that file exits 0).
- **ac-05**: `grep -q 'luca budget check' packages/luca-tools/src/artifacts/skills/lu/index.ts` succeeds (exit 0).
- **ac-06**: `grep -q 'luca budget check' packages/luca-tools/src/artifacts/commands/lu.ts` succeeds (exit 0).
- **ac-07**: `grep -q 'budget.halt' packages/luca-tools/src/artifacts/skills/lu/index.ts` succeeds (exit 0).
- **ac-08**: `grep -q 'budget.halt' packages/luca-tools/src/artifacts/commands/lu.ts` succeeds (exit 0).
- **ac-09**: `grep -q 'luca budget check' packages/luca-tools/src/artifacts/skills/phase-execute/index.ts` succeeds (exit 0).
- **ac-10**: `grep -q 'budget_halt' packages/luca-tools/src/artifacts/skills/phase-execute/index.ts` succeeds (exit 0).
- **ac-11**: `grep -q 'maxWallClockMs' docs/getting-started.md` succeeds (exit 0).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT — modify any Phase-1 budget-core file; `git diff --name-only` over `packages/luca-core/src/state/helpers/resolve-run-budget.ts packages/luca-core/src/state/schemas.ts packages/luca-core/src/state/configs/budget-matrix.ts packages/luca-cli/src/commands/write-surface/budget.ts packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts` returns empty (no Phase-2 change).
- **anti-02**: MUST NOT — let the statusline sidecar write throw; piping a malformed/cost-less payload into `bun packages/luca-tools/src/statusline/handler.ts` still exits 0 (write block wrapped in try/catch).
- **anti-03**: MUST NOT — edit only one /lu surface; `grep -l 'luca budget check' packages/luca-tools/src/artifacts/skills/lu/index.ts packages/luca-tools/src/artifacts/commands/lu.ts | wc -l` equals 2 (dual-surface sync).
