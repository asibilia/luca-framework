/**
 * gh-issue-triage slash command — Pull open GitHub issues into the MuninnDB todo backlog for pipeline execution.
 *
 * Ported from ~/.claude/commands/gh-issue-triage.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /gh-issue-triage

Activate the \`gh-issue-triage\` skill to pull open GitHub issues into the todo backlog. Each issue becomes a \`todo:*\` memory in the repo vault (via the \`luca todo add\` CLI with \`--source gh-issue-#<N>\`), so the finalizing flow can add \`Closes #<N>\` to the PR. Issues labeled \`skip-triage\` are filtered out.

Flow: GitHub Issues → gh-issue-triage → todos → \`/lu\` pipeline → PR.

Run the \`gh-issue-triage\` skill now. Optional arguments — label filters or explicit issue numbers:

$ARGUMENTS
`

export const ghIssueTriageCommand = defineCommand({
    name: 'gh-issue-triage',
    description:
        'Pull open GitHub issues into the MuninnDB todo backlog for pipeline execution.',
    body: BODY,
})
