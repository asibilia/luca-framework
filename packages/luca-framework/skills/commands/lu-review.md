---
name: lu-review
description: Re-enter the Luca pipeline at the review step to audit completed work.
---

# /lu-review

Run the **review** step against the active phase — a structured multi-perspective audit of executed code. Use this after `/phase-execute` + verification, or to re-audit a phase before closing it.

You are orchestration only: read state, run the reviewers, let them persist their audits with the `Write` tool.

## Step 0 — Read state

Run `luca state read`. The review step has exactly one legal entry: `verify → review`. There is no bypass — `luca state advance` rejects illegal jumps.

- `pipelineStep === "verify"` → run `luca state advance --to-step review`, then proceed.
- `pipelineStep === "review"` → already there, proceed.
- anything else → STOP. Tell the user the pipeline must reach `verify` before review can run, and point them at `/lu` to drive it there. Do not attempt to force the transition.

Run `luca phase current` to get the active slug. If no phase is active, abort.

## Run the reviewers

Spawn the `luca-reviewer` subagent via the `Agent` tool — once per perspective, in parallel:

- `architect` — structural correctness, dependency direction, API surface
- `dx` — readability, error messages, ergonomics
- `security` — input validation, injection, secret handling
- `simplification` — unnecessary complexity, dead code
- `test-quality` — vacuous mocks, presence-only assertions, coverage-by-existence

Pass each reviewer its assigned perspective and the active phase slug. Each reviewer persists its own audit by writing `audits/<reviewer>.md` with the `Write` tool to the canonical phase path (the stage-gate hook only permits that write in the `review` step).

Scale the perspective set to complexity: TRIVIAL/SIMPLE may run only `architect` + `security`; MODERATE+ runs the full set.

## Aggregate

When all reviewers return, summarize for the user:

- Total MUST-FIX / SHOULD-FIX / NOTE counts across audits
- Whether any reviewer returned `REQUEST_CHANGES`

If there are MUST-FIX findings, the phase is not ready to advance — direct the user back to `/phase-execute` to address them (the `verify → checks → execute` loop-back path). If all reviewers APPROVE, advance with `luca state advance --to-step learn`.

## What you must NOT do

- Do NOT force a transition into `review` from a non-`verify` state. Honor the no-bypass policy.
- Do NOT write audit files yourself — the reviewers write `audits/<reviewer>.md` with the `Write` tool to the canonical path; the hook blocks any other write.
- Do NOT fix the findings yourself in this skill. Review reports; execute fixes.

$ARGUMENTS
