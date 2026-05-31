/**
 * luca-init slash command — Seed project preferences (branching, commits, PR, release, tracker conventions) for this repo.
 *
 * Ported from ~/.claude/commands/luca-init.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /luca-init

Activate the \`luca-init\` skill to probe the repository and seed its project preferences — branch naming, commit conventions, PR templates, release tooling, and issue tracker.

This is distinct from the \`luca init\` CLI command (\`npx luca init\`), which wires up the per-project \`.claude/\` hooks. \`/luca-init\` runs *after* that, to capture the repo's working conventions into \`.luca/config.json\` (via the \`luca preferences write\` CLI) so the pipeline emits work that matches the project's existing style.

Run the \`luca-init\` skill now. Optional arguments — \`--auto\` for non-interactive mode, or free-form hints about repo conventions:

$ARGUMENTS
`

export const lucaInitCommand = defineCommand({
    name: 'luca-init',
    description:
        'Seed project preferences (branching, commits, PR, release, tracker conventions) for this repo.',
    body: BODY,
})
