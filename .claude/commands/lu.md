---
name: lu
description: Start (or resume) the Luca autonomous development pipeline for a request.
---

# /lu

The unified entry point for the Luca pipeline. `/lu <request>` takes a development request and drives it through the full pipeline: triage → research → discuss → architect → plan → plan-review → execute → checks → verify → review → learn → milestone.

You are the **orchestrator**. You do not write code or planning artifacts directly — you read state, run each step (delegating to its skill or subagent), and advance the pipeline.

## Step 0 — Read state

Call `luca_state_read`. Branch on `pipelineStep`:

- `idle` or `complete` → fresh start. Go to **Triage**.
- anything else → the pipeline is mid-flight. Skip triage, go straight to **Pipeline loop** and resume from the current step.

If the user passed a request but the pipeline is already mid-flight, surface that to the user and ask whether to resume the current run or finish it first — do NOT silently discard either.

## Triage

Triage runs once, at the start of a run. It is inline here — there is no separate triage skill.

1. **Classify complexity.** Read the request. Pick one of `TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL` based on file count, scope, and risk. Persist it: `luca_state_set_field` is not available — record the complexity in your reasoning and pass it to every subagent you spawn (the model-routing table keys off it).
2. **Build the roadmap.** Decompose the request into ordered phases. Each phase is one deliverable unit. Call:
   ```
   luca_roadmap_create({ phases: [
     { name: "<kebab-or-prose name>", deps: [], complexity: "<level>" },
     ...
   ] })
   ```
   For a single-deliverable request, that is a one-phase roadmap. `luca_roadmap_create` is only legal in `idle`/`triage` — it resets `currentPhase` to 0.
3. **Advance** `idle → triage → research` via two `luca_state_advance` calls.

## Pipeline loop

Repeat until `pipelineStep` is `complete`:

1. Call `luca_state_read` to get the current `pipelineStep`.
2. Run the step using the table below.
3. Advance to the next step with `luca_state_advance({ toStep: ... })`. Transitions are validated server-side against the pipeline-transitions table — illegal jumps are rejected.

| Step          | How to run it                                                              |
|---------------|----------------------------------------------------------------------------|
| `research`    | Spawn `luca-researcher` (Agent tool). Persist its output via `luca_phase_write_research`. |
| `discuss`     | Invoke the `/phase-discuss` skill.                                         |
| `architect`   | Lightweight synthesis: read research + context, confirm the plan-ready brief. Advance to `plan`. |
| `plan`        | Invoke the `/phase-plan` skill.                                            |
| `plan-review` | Spawn `luca-plan-reviewer` (Agent tool). On `NEEDS_REVISION`, loop back to `plan`. |
| `execute`     | Invoke the `/phase-execute` skill.                                         |
| `checks`      | Call `luca_checks_run` with the project's typecheck (and tests, if present). On failure, loop back to `execute`. |
| `verify`      | Spawn `luca-verifier` (Agent tool). On `recommendation: fix`, loop back to `checks`; on `escalate`, stop and surface to the user. |
| `review`      | Spawn `luca-reviewer` (Agent tool) — one per perspective, in parallel.     |
| `learn`       | Spawn `luca-learner` (Agent tool). Then: more phases remain → advance to `plan` for the next phase; last phase → advance to `milestone`. |
| `milestone`   | Invoke the `/milestone-new` skill to close out, or advance to `complete` if no milestone bookkeeping is needed. |

## Oversight

Read `oversight` from `luca_state_read`:

- `full-auto` — run the whole loop without pausing.
- `checkpoint` — pause after `plan-review`, `verify`, and `learn` for user confirmation.
- `human-in-loop` — pause after every step.

## What you must NOT do

- Do NOT write code or `.luca/` artifacts directly. Every artifact is written by a subagent or `/phase-*` skill through an MCP write tool. The stage-gate hook blocks direct writes.
- Do NOT skip steps. The pipeline-transitions table is the contract; `luca_state_advance` enforces it. There is no bypass.
- Do NOT re-triage a mid-flight pipeline. Resume from the current step instead.
- Do NOT commit. Commits happen only in the finalizing flow, never inside `/lu`.

$ARGUMENTS
