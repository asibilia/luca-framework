# Execution Summary: 05-learning-loop-upgrades

**Status:** All tasks complete (Wave A 6 tasks + Wave B 3 tasks). `luca checks run` (tsc) passed after every round; compile-smoke fixture green ("SMOKE OK"). Staged-only (commits blocked in EXECUTING).

Two parallel tracks, executed in 2 rounds to respect the A.1→A.2→A.3→content dependency and avoid the learner.ts cross-track race.

| Round | Tasks | Files |
|------|-------|-------|
| 1 | A.1 schema (optional gotchas), A.2 renderGotchasPrelude, B.1/B.2/B.3 learner C/R/L body | define/agent.ts + subagent.ts, compile/render-body.ts, subagents/learner.ts (body only) |
| 2 | A.3 emitter pass-through, A.4a 10 modes, A.4b 10 subagents (+learner gotchas field), A.5 smoke fixture | emit-agent.ts + emit-subagent.ts, 10 modes/, 10 subagents/, compile-smoke.ts |

## Deliverables
- **D2 REQ-07 Gotchas:** optional `gotchas: z.array(z.string()).default([])` on Agent+Subagent schemas (Q1: optional + parity audit, NOT `.min(1)` — no module-load flag-day); `renderGotchasPrelude` (idempotent, no Date.now/Math.random) emits `## Gotchas`, wired through `BodyRenderInput` + both emitters; non-empty gotchas authored on all 20 artifacts (10 modes + 10 subagents) with stage/agent-specific footguns; smoke fixture gains gotchas values + two `## Gotchas` golden checks.
- **D1 REQ-06 Deutsch C/R/L:** learner per-learning extraction restructured in-place to CONJECTURED / REFUTED_BY / LEARNED / CRITERION_NOW (kept LEARNING_TYPE/CONCEPT/CONFIDENCE for routing); learn.md renders the C/R/L fields; C/R/L carried INSIDE the existing TO_PERSIST `content:` field (Q2 — zero orchestrator/MuninnDB ripple, single TO_PERSIST block).

## Confidence gate
1 `ask` (Q1 gotchas enforcement) → user selected OPTIONAL field + parity audit. 2 auto (Q2 content-carry, Q3 20-site scope).

## Mandatory ("every artifact has a value") satisfied
ac-06: `grep -rL "gotchas:" $(grep -rl "defineAgent(" modes/)` → 0 files. ac-07: same for subagents → 0 files. All 20 carry a `gotchas:` value (the parity audit), so "mandatory" holds despite the optional Zod field.

## Deviations
- Per-task commits blocked in EXECUTING; per-task `git add` only. learner.ts touched by two tasks (B body round 1, A.4b gotchas field round 2) — sequenced across rounds, no race.
