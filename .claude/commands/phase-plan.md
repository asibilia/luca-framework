---
name: phase-plan
description: Drive the "plan" pipeline step — produce a phase plan grounded in the user decisions from /phase-discuss.
---

# /phase-plan

You are running the **plan** step. Research is done, user decisions are captured in `context.md`. Your job is to produce a phase plan that downstream stages will execute.

## Preconditions

1. Call `luca_state_read`. The `pipelineStep` must be `architect` (entering plan) or `plan` (already advanced).
2. If currently `architect`, call `luca_state_advance({ toStep: "plan" })`.
3. Call `luca_phase_current` to get the active slug. If no active phase, abort.

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

When the planner returns, write the plan via:

```
luca_phase_write_plan({ content: "<plan markdown>" })
```

The MCP server allows this only when `pipelineStep === "plan"`. Direct `Edit` is blocked by the hook.

## Advance

Call `luca_state_advance({ toStep: "plan-review" })` to hand off to plan-review.

## What you must NOT do

- Do NOT write code. Code writes are blocked in PLANNING.
- Do NOT bypass the planner subagent by writing the plan yourself unless the user explicitly asks. The subagent is where the conceptual work happens.
- Do NOT call `Edit` on `plan.md` — use the MCP tool.
