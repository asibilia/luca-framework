/**
 * phase-discuss slash command — Drive the "discuss" pipeline step — gather user decisions for the active phase and persist them as context.md.
 *
 * Ported from ~/.claude/commands/phase-discuss.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /phase-discuss

You are running the **discuss** step of the luca pipeline. The current phase has been triaged and researched; now you need user decisions before planning can begin.

## Preconditions

Before doing anything, confirm we're in the right state:

1. Run \`luca state read\` and verify \`pipelineStep\` is either \`research\` (transitioning forward) or \`discuss\` (already advanced).
2. If \`pipelineStep\` is \`research\`, run \`luca state advance --to-step discuss\` to enter this step.
3. Run \`luca phase current\` to get the active phase slug and directory. If \`active\` is false, abort and ask the user to set the roadmap first.

If the state is anything else, surface a clear error to the user instead of guessing.

## Gather decisions

Ask the user 1–4 focused questions to resolve open scope/design decisions for the phase. Reference the research findings (read from \`.luca/phases/<slug>/research.md\` via the \`Read\` tool) so the questions are grounded.

Use the \`AskUserQuestion\` tool when there are concrete choices with trade-offs. Keep questions focused — no padding.

## Persist context

When the user has answered, write the consolidated context with the \`Write\` tool to the canonical path. Use the \`dir\` field from \`luca phase current\`; the context path is \`<dir>/context.md\`:

\`\`\`
Write tool → <dir>/context.md
content: "<markdown summary of decisions>"
\`\`\`

The stage-gate hook only permits this \`Write\` to \`<dir>/context.md\` while \`pipelineStep === "discuss"\` — any other path or step is blocked.

## Advance

When context.md is written, run \`luca state advance --to-step architect\` so the next step can begin.

## What you must NOT do

- Do NOT write \`context.md\` to any path other than \`<dir>/context.md\`, or via \`Edit\` — the hook blocks every other \`.luca/\` write.
- Do NOT skip the question-asking step just because you have an opinion. The point of \`/phase-discuss\` is to surface user decisions, not yours.
- Do NOT write code in this step. Code writes are blocked by the stage-gate in PLANNING phases.
`

export const phaseDiscussCommand = defineCommand({
    name: 'phase-discuss',
    description:
        'Drive the "discuss" pipeline step — gather user decisions for the active phase and persist them as context.md.',
    body: BODY,
})
