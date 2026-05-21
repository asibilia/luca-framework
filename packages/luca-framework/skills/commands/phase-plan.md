---
name: phase-plan
description: Drive the "plan" pipeline step — produce a phase plan grounded in the user decisions from /phase-discuss.
---

# /phase-plan

You are running the **plan** step. Research is done, user decisions are captured in `context.md`. Your job is to produce a phase plan that downstream stages will execute.

## Preconditions

1. Run `luca state read`. The `pipelineStep` must be `architect` (entering plan) or `plan` (already advanced).
2. If currently `architect`, run `luca state advance --to-step plan`.
3. Run `luca phase current` to get the active slug and directory. If no active phase, abort.

## Read inputs

Read these in order via the `Read` tool:
- `.luca/phases/<slug>/research.md` — research findings
- `.luca/phases/<slug>/context.md` — user decisions

If either is missing, abort with a clear error pointing at the missing step.

## Delegate to the planner subagent

Spawn the `luca-planner` subagent via the `Agent` tool with a prompt that includes:
- The phase slug
- The current `pipelineStep` (always `plan` here)
- A summary of research findings + user decisions
- An instruction to produce a plan and return it as a markdown string

The subagent does the cognitive work; this skill is just orchestration.

## Persist the plan

When the planner returns, write the plan with the `Write` tool to the canonical path. Use the `dir` field from `luca phase current`; the plan path is `<dir>/plan.md`:

```
Write tool → <dir>/plan.md
content: "<plan markdown>"
```

The stage-gate hook only permits this `Write` to `<dir>/plan.md` while `pipelineStep === "plan"` — any other path or step is blocked.

## Advance

Run `luca state advance --to-step plan-review` to hand off to plan-review.

## What you must NOT do

- Do NOT write code. Code writes are blocked in PLANNING.
- Do NOT bypass the planner subagent by writing the plan yourself unless the user explicitly asks. The subagent is where the conceptual work happens.
- Do NOT write `plan.md` to any path other than `<dir>/plan.md`, or via `Edit` — the hook blocks every other `.luca/` write.
