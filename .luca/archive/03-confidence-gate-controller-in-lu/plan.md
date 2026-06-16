---
phase: 3
slug: 03-confidence-gate-controller-in-lu
wave: 1
tdd: false
complexity: COMPLEX
---

# Plan — Phase 3: confidence-gate-controller-in-lu  (rev 2)

## Objective
Wire the confidence gate into the `/lu` orchestrator and redefine `full-auto`. After this phase the pipeline runs the gate between `plan-review` and `execute`: it reads the plan's confidence journal (emitted by the architect in Phase 2), routes each entry, and the ONLY thing that pauses full-auto is a low-confidence **unresearchable** (`ask`) item.

## Design constraints (locked)
- **No new state-machine step; no luca-core change.** The gate is orchestrator PROSE that runs at the tail of the `plan-review` step, before advancing to `execute`. `pipelineStep` enum + transitions + `OversightMode` (3 values) stay unchanged.
- **Persistence target = `plan-review.md`, NOT `context.md`.** (rev-2 fix: at `pipelineStep=plan-review` the stage-gate hook permits only `plan-review.md`; `context.md` is `discuss`-only and would be hard-blocked — confirmed against `step-artifacts.ts`.) The gate appends a `## Confidence Gate Resolutions` section to the existing `plan-review.md`. The orchestrator ALSO holds resolutions in-context and injects them into the executor's prompt at the `execute` step (live), so durability (plan-review.md) and use (executor prompt) are both covered.
- **Journal-ordering invariant (explicit):** the gate reads the journal only after `plan-review` completes (architect fully exited at `plan`, so `confidence.jsonl` is fully populated). The journal is append-only and the gate is single-pass; if a `plan-review→plan` retry re-emits entries, they re-bucket identically — harmless.
- Reuse `luca confidence gate` (Phase 1) + the `researcher` subagent. No new agent types. Journal entries are not mutated (a `luca confidence resolve` for a true re-emit/re-gate loop is a noted follow-up, not built).

## Tasks (atomic — `bunx --bun tsc --noEmit` + `bun run build` after each)

### Task 1 — Gate sub-step in the `lu` SKILL
File: `packages/luca-tools/src/artifacts/skills/lu/index.ts`.
- After the `plan-review` row resolves and BEFORE advancing to `execute`, add a "Confidence Gate" sub-step:
  1. Run `luca confidence gate` (active phase) → parse `{auto,research,ask,counts}`.
  2. `auto` → proceed silently.
  3. Each `research` entry → spawn a `researcher` (Agent tool) with the entry's `decision`/`category`/`reasoning`; record the recommendation.
  4. Each `ask` entry → surface ONE targeted question to the user (entry `decision` + `alternatives`); capture the answer. **This is the only full-auto pause.**
  5. Append all resolutions (research answers + ask answers, annotated `[gate-research]`/`[gate-ask]`) as a `## Confidence Gate Resolutions` section to `.luca/phases/<slug>/plan-review.md` (legal at this step) — read-then-write/Edit.
  6. Advance to `execute`. At the `execute` step, INJECT the gate resolutions into the executor/`phase-execute` prompt so the implementer acts on them.
- State: in `full-auto`, the gate still surfaces `ask` items by design; `checkpoint`/`human-in-loop` additionally pause at their normal points.
- **Verify:** tsc + build (skills:41). Grep: lu skill contains "Confidence Gate", `luca confidence gate`, `[gate-ask]`, `[gate-research]`, `plan-review.md`, between plan-review and execute. End-to-end smoke (relinked bin): `luca confidence log --phase <tmp-slug> --wave 1 --task t --confidence low --category plan-gap --decision d --alternatives none --reasoning r --risk none --files x.ts` then `luca confidence gate --slug <tmp-slug>` → output contains a non-empty `"ask"` bucket. (Use a throwaway slug; do not pollute a real phase journal.)

### Task 2 — Mirror gate sub-step into the `/lu` COMMAND
File: `packages/luca-tools/src/artifacts/commands/lu.ts`.
- Add the same Confidence Gate sub-step (concise mirror) + a gate note between plan-review and execute in the loop table; same `plan-review.md` persistence + executor injection.
- **Verify:** tsc + build (commands:17). Grep parity: command references `luca confidence gate` + routing + `plan-review.md`.

### Task 3 — Redefine `full-auto` semantics + de-stale "future" references
- `lu` skill + command "Oversight" sections: `full-auto` → "autonomous — the only pauses are confidence-gate `ask` items (low-confidence + unresearchable) and CRITICAL safety. `checkpoint` adds pauses after plan-review/verify/learn; `human-in-loop` pauses every step."
- `packages/luca-tools/src/artifacts/modes/triage.ts`: update oversight-level descriptions to match.
- `packages/luca-tools/src/artifacts/modes/execute.ts`: update "Checkpoint Interaction" so `full-auto` reflects gate-pause semantics (not "no questions ever").
- De-stale the now-live gate: `packages/luca-tools/src/artifacts/modes/architect.ts` (~the "(future) plan→execute confidence gate" line) and `packages/luca-tools/src/artifacts/skills/phase-plan/index.ts` (~the "(future)" pointer) → change "future" → "active".
- Do NOT touch `OversightMode` in luca-core (prose-only).
- **Verify:** tsc + build. Grep: lu skill, lu command, triage, execute all describe `full-auto` as confidence-gated consistently; no "(future)" gate qualifier remains; `packages/luca-core/src/state/schemas.ts` unchanged.

## Success criteria
- [ ] Gate sub-step in lu skill + command runs `luca confidence gate` between plan-review and execute; routes auto/research/ask; `ask` is the sole full-auto pause; resolutions appended to plan-review.md + injected into executor.
- [ ] `full-auto` redefined consistently (lu skill, lu command, triage, execute); "(future)" gate refs updated; 3-level enum unchanged.
- [ ] `bunx --bun tsc --noEmit` passes; `bun run build` compiles (skills:41, commands:17); no luca-core change; no new pipelineStep/agent.
- [ ] Not committed (finalize commits).

## Follow-up (noted, not built)
- `luca confidence resolve` (mark journal entries resolved) → enables a true re-emit/re-gate loop; and optionally allow `context.md` at plan-review (step-artifacts change) if resolutions should live in context.md long-term.
