/**
 * grill-me slash command — Stress-test a plan or design by walking each branch of the decision tree.
 *
 * Ported from ~/.claude/commands/grill-me.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /grill-me

Activate the \`grill-me\` skill to interview you relentlessly about a plan or design — walking each branch of the decision tree, surfacing unstated assumptions, and offering an ADR only when a choice is hard to reverse, surprising, and carries a real trade-off.

Run the \`grill-me\` skill now. The plan or design to grill:

$ARGUMENTS
`

export const grillMeCommand = defineCommand({
    name: 'grill-me',
    description:
        'Stress-test a plan or design by walking each branch of the decision tree.',
    body: BODY,
})
