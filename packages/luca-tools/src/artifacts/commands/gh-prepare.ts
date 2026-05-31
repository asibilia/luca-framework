/**
 * gh-prepare slash command — Ship committed work — ensure a changeset, push the feature branch, open a draft PR.
 *
 * Ported from ~/.claude/commands/gh-prepare.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /gh-prepare

Activate the \`gh-prepare\` skill to ship committed work: ensure a changeset exists, push the current feature branch to the remote, and open (or update) a draft PR that links its tracking issue with \`Closes #<issue>\` for auto-linking.

Works standalone or inside the pipeline. Run the \`gh-prepare\` skill now. Optional arguments — free-form hints (issue number, PR title, base branch):

$ARGUMENTS
`

export const ghPrepareCommand = defineCommand({
    name: 'gh-prepare',
    description:
        'Ship committed work — ensure a changeset, push the feature branch, open a draft PR.',
    body: BODY,
})
