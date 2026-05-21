---
name: phase-execute
description: Drive the "execute" pipeline step — implement the phase plan with per-task commits and verification.
---

# /phase-execute

You are running the **execute** step. The plan exists and has been reviewed. Your job is to implement it.

## Preconditions

1. Run `luca state read`. The `pipelineStep` must be `plan-review` (entering execute) or `execute` (already advanced).
2. If currently `plan-review`, run `luca state advance --to-step execute`.
3. Run `luca phase current` to get the active slug.

## Read the plan

Read `.luca/phases/<slug>/plan.md`. If the plan doesn't exist or appears empty, abort and direct the user back to `/phase-plan`.

## Delegate to the executor subagent

Spawn the `luca-executor` subagent via the `Agent` tool with a prompt that includes:
- The full plan content
- The phase slug
- Whatever constraints apply (e.g. test-driven development, no commits without verification)

The subagent does the actual code-writing work. **You are orchestration only** — do not start editing files yourself in this skill. Code writes happen inside the subagent's tool calls, which the stage-gate hook allows because we're in `EXECUTING` phase.

## Verification gate

When the executor returns, run `luca state advance --to-step checks` to enter the mechanical verification step (typecheck + tests).

The checks step is its own skill; `/phase-execute` is done once the executor reports completion.

## What you must NOT do

- Do NOT advance to `checks` until the executor reports that the plan is implemented.
- Do NOT skip writing the execute summary — the executor produces one and writes it with the `Write` tool to `<dir>/execute/summary.md` (the canonical path); the hook blocks any other `.luca/` write.
- Do NOT commit on behalf of the user during execute. Commits are FINALIZING-only and the hook blocks them here.
