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

The legacy v12 \`lu-planner\` subagent was dropped per plan §5.6 — planning work is done by the architect mode-agent or, when invoked from the \`/phase-plan\` command flow, inline by the orchestrator. Synthesize the plan from:
- The phase slug
- The current \`pipelineStep\` (always \`plan\` here)
- The research findings + user decisions read above
- The repo's coding patterns (from research) and acceptance criteria

The plan should be a markdown document with: objective, atomic tasks (waves), and a \`## Verification Criteria\` section carrying plan-authored ac-IDs (grammar: \`- **ac-NN**: <one binary probe>\`). Each task's Verification line references ac-IDs from that section. Every criterion must pass the Splitting Test — exactly one binary probe (a single command/check with a pass/fail outcome); criteria compounded with "and"/"with" must be split, and "all/every/complete" criteria must enumerate sub-criteria. The plan must also carry ≥1 anti-criterion (\`- **anti-NN**: MUST NOT — <guard + probe>\`) derived from the context.md Out of Scope section. Criterion IDs are stability-locked: never renumber across plan revisions; splits become \`ac-NN.M\` with the parent line converted to a \`[SPLIT → ac-NN.1, ac-NN.2]\` pointer; dropped criteria become tombstones (\`- **ac-NN**: [DROPPED — see decisions <date>]\`), never deleted.

## Persist the plan

Write the plan with the \`Write\` tool to the canonical path. Use the \`dir\` field from \`luca phase current\`; the plan path is \`<dir>/plan.md\`:

\`\`\`
Write tool → <dir>/plan.md
content: "<plan markdown>"
\`\`\`

The stage-gate hook only permits this \`Write\` to \`<dir>/plan.md\` while \`pipelineStep === "plan"\` — any other path or step is blocked.

## Pre-review lint

After persisting the plan, run \`luca plan lint --file <dir>/plan.md\`. The linter is warn-only (always exits 0 on lint findings) and checks mechanical conformance to the criteria grammar. The plan must carry a \`## Deliverables\` section mapping each explicit ask in the phase goal to its verification criteria; the linter warns on missing or malformed D-lines (canonical D-line grammar lives in the Architect mode plan template). Address each warning before advancing: fix the criterion, or justify the deviation in the plan's decisions/notes.

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
