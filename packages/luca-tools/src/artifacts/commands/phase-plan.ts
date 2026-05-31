/**
 * phase-plan slash command — Drive the "plan" pipeline step — produce a phase plan grounded in the user decisions from /phase-discuss.
 *
 * Ported from ~/.claude/commands/phase-plan.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /phase-plan

You are running the **plan** step. Research is done, user decisions are captured in \`context.md\`. Your job is to produce a phase plan that downstream stages will execute.

## Preconditions

1. Run \`luca state read\`. The \`pipelineStep\` must be \`architect\` (entering plan) or \`plan\` (already advanced).
2. If currently \`architect\`, run \`luca state advance --to-step plan\`.
3. Run \`luca phase current\` to get the active slug and directory. If no active phase, abort.

## Read inputs

Read these in order via the \`Read\` tool:
- \`.luca/phases/<slug>/research.md\` — research findings
- \`.luca/phases/<slug>/context.md\` — user decisions

If either is missing, abort with a clear error pointing at the missing step.

## Produce the plan

The legacy v12 \`luca-planner\` subagent was dropped per plan §5.6 — planning work is done by the architect mode-agent or, when invoked from the \`/phase-plan\` command flow, inline by the orchestrator. Synthesize the plan from:
- The phase slug
- The current \`pipelineStep\` (always \`plan\` here)
- The research findings + user decisions read above
- The repo's coding patterns (from research) and acceptance criteria

The plan should be a markdown document with: objective, atomic tasks (waves), verification criteria per task, and success criteria for the phase.

## Persist the plan

Write the plan with the \`Write\` tool to the canonical path. Use the \`dir\` field from \`luca phase current\`; the plan path is \`<dir>/plan.md\`:

\`\`\`
Write tool → <dir>/plan.md
content: "<plan markdown>"
\`\`\`

The stage-gate hook only permits this \`Write\` to \`<dir>/plan.md\` while \`pipelineStep === "plan"\` — any other path or step is blocked.

## Advance

Run \`luca state advance --to-step plan-review\` to hand off to plan-review.

## What you must NOT do

- Do NOT write code. Code writes are blocked in PLANNING.
- Do NOT skip the synthesis step — read research.md + context.md before drafting the plan. The plan must be grounded in those inputs.
- Do NOT write \`plan.md\` to any path other than \`<dir>/plan.md\`, or via \`Edit\` — the hook blocks every other \`.luca/\` write.
`

export const phasePlanCommand = defineCommand({
    name: 'phase-plan',
    description:
        'Drive the "plan" pipeline step — produce a phase plan grounded in the user decisions from /phase-discuss.',
    body: BODY,
})
