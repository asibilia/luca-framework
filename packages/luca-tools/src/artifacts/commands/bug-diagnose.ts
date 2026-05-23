/**
 * bug-diagnose slash command — Disciplined bug diagnosis — build a feedback loop, reproduce, hypothesise, instrument, fix.
 *
 * Ported from ~/.claude/commands/bug-diagnose.md (user copy canonical) (E-6).
 * The command body is the user's explicit `/bug-diagnose` invocation surface
 * — meaningfully thinner than the corresponding bug-diagnose skill, hence
 * ported per the E-6 decision algorithm.
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /bug-diagnose

Activate the \`bug-diagnose\` skill to run a disciplined diagnosis loop: establish a fast feedback loop, reproduce the failure deterministically, form and test hypotheses, instrument the code, then apply the fix and confirm it.

Run the \`bug-diagnose\` skill now. The bug or issue to diagnose:

$ARGUMENTS
`

export const bugDiagnoseCommand = defineCommand({
    name: 'bug-diagnose',
    description:
        'Disciplined bug diagnosis — build a feedback loop, reproduce, hypothesise, instrument, fix.',
    body: BODY,
})
