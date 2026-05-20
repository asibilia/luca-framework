---
name: phase-discuss
description: Drive the "discuss" pipeline step — gather user decisions for the active phase and persist them as context.md.
---

# /phase-discuss

You are running the **discuss** step of the luca pipeline. The current phase has been triaged and researched; now you need user decisions before planning can begin.

## Preconditions

Before doing anything, confirm we're in the right state:

1. Call the MCP tool `luca_state_read` and verify `pipelineStep` is either `research` (transitioning forward) or `discuss` (already advanced).
2. If `pipelineStep` is `research`, call `luca_state_advance({ toStep: "discuss" })` to enter this step.
3. Call `luca_phase_current` to get the active phase slug. If `active` is false, abort and ask the user to set the roadmap first.

If the state is anything else, surface a clear error to the user instead of guessing.

## Gather decisions

Ask the user 1–4 focused questions to resolve open scope/design decisions for the phase. Reference the research findings (read from `.luca/phases/<slug>/research.md` via the `Read` tool) so the questions are grounded.

Use the `AskUserQuestion` tool when there are concrete choices with trade-offs. Keep questions focused — no padding.

## Persist context

When the user has answered, write the consolidated context via:

```
luca_phase_write_context({ content: "<markdown summary of decisions>" })
```

The MCP server enforces that this call only works when `pipelineStep === "discuss"`. The stage-gate hook prevents you from `Edit`-ing `.luca/phases/<slug>/context.md` directly — always go through the tool.

## Advance

When context.md is written, call `luca_state_advance({ toStep: "architect" })` so the next step can begin.

## What you must NOT do

- Do NOT write `context.md` via `Edit` or `Write` — use the MCP tool. The hook will block direct writes.
- Do NOT skip the question-asking step just because you have an opinion. The point of `/phase-discuss` is to surface user decisions, not yours.
- Do NOT write code in this step. Code writes are blocked by the stage-gate in PLANNING phases.
