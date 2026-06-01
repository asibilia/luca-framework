/**
 * milestone-new slash command — Start a new milestone cycle — gather goals, optionally research, define requirements, build the roadmap.
 *
 * Ported from ~/.claude/commands/milestone-new.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /milestone-new

Start a new milestone cycle. This is the brownfield equivalent of project initialization — use it when beginning a fresh body of work on an existing project.

## Parse arguments

Parse \`$ARGUMENTS\` for:
- An optional **milestone name** (e.g. \`"v2 API Redesign"\`)
- An optional **version** (e.g. \`v2\`, \`v3\`)
- \`--skip-research\` — skip the research step

## Step 1 — Load context

1. Recall project identity from MuninnDB: \`mcp__muninn__muninn_recall({ vault: "<repo_vault>", context: ["brain:project-identity"], mode: "semantic" })\`.
2. Recall prior milestones: \`mcp__muninn__muninn_recall({ vault: "<repo_vault>", context: ["milestone:"], mode: "recent" })\`.
3. Run \`luca state read\` to check the pipeline status.

Resolve \`<repo_vault>\` from \`.luca/config.json\` → \`muninn.vault\`, falling back to \`"default"\`.

If the pipeline is mid-flight (\`pipelineStep\` is not \`idle\` or \`complete\`), warn the user that starting a new milestone resets pipeline state, and confirm before proceeding.

## Step 2 — Gather milestone goals

Ask the user (use \`AskUserQuestion\` where there are real choices):
- What should this milestone accomplish?
- Key features or changes?
- Constraints or deadlines?
- Target scope — a small focused change or a large feature set?

Compile the answers into a structured goal list.

## Step 3 — Determine version

- If prior milestones exist (from the Step 1 recall), suggest the next sequential version.
- If a version was passed in arguments, use that.
- If there are no prior milestones, start at \`v1\`.

Confirm the version with the user.

## Step 4 — Persist the milestone

Store the milestone in MuninnDB (the \`milestone:*\` prefix routes to the **repo** vault per the vault-routing rule):

\`\`\`
mcp__muninn__muninn_remember({
  vault: "<repo_vault>",
  concept: "milestone:v<version>-goals",
  content: "<structured goal list + scope + constraints>"
})
\`\`\`

There is no \`.luca/PROJECT.md\` — project identity lives in the MuninnDB brain tree, and milestone goals live in the \`milestone:*\` memory above. Do not create root-level planning files; the \`.luca/\` contract does not allow them.

## Step 5 — Research (optional)

Unless \`--skip-research\` is set, for each major feature area spawn the \`researcher\` subagent via the \`Agent\` tool with milestone-aware context (project brief + goal list + the feature to research).

Store each research summary in MuninnDB under \`research:<feature-slug>\` in the repo vault. Per-phase \`research.md\` files are written later by the pipeline once phases exist — milestone-level research is memory-only.

Present a summary of key findings to the user.

## Step 6 — Define requirements

Based on the goals (and research, if run), present the feature list with suggested scope:
- **Must have** — core requirements that define the milestone
- **Should have** — important, not blocking
- **Nice to have** — stretch goals

Let the user adjust. Fold the agreed requirement list into the milestone memory from Step 4 (re-\`remember\` with the requirements appended) — there is no separate requirements file.

## Step 7 — Build the roadmap

Organize the requirements into ordered phases by dependency and priority. Stage the phases array in a JSON file, then run \`luca roadmap create --file\`:

\`\`\`
# /tmp/luca-roadmap.json:
# [
#   { "name": "<phase name>", "deps": [...], "complexity": "<TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL>" },
#   ...
# ]
luca roadmap create --file /tmp/luca-roadmap.json
\`\`\`

\`luca roadmap create\` is only legal in \`idle\`/\`triage\`; it resets \`currentPhase\` to 0 and sets \`totalPhases\`. If the pipeline was mid-flight and the user confirmed the reset in Step 1, run \`luca workflow reset --confirm\` first to return to a clean idle state.

## Step 8 — GitHub tracking

Offer three options:

1. **New issue + branch** — \`gh issue create --title "v<version>: <name>" --body "<description>"\`, then create and push a feature branch.
2. **Continue on existing** — comment on the open issue noting the new milestone, keep the current branch.
3. **No tracking** — skip (warn that no PR will be auto-created later).

## Step 9 — Done

Report completion:

\`\`\`
## Milestone v<version>: <name> — Initialized

Roadmap: <N> phases. Pipeline reset to idle.
Next: /lu <describe the first phase of work>
\`\`\`

Record the initialization in MuninnDB and promote it to the verified tier:

\`\`\`
mcp__muninn__muninn_remember({
  vault: "<repo_vault>",
  concept: "milestone:v<version>-initialized",
  content: "Milestone v<version> '<name>' initialized: <N> requirements across <N> phases. Goals: <brief>."
})
\`\`\`

Capture the returned id and call \`mcp__muninn__muninn_trust({ id: <id>, trust: "verified", vault: "<repo_vault>" })\` — this is a user-confirmed milestone, so it belongs at the verified tier.

$ARGUMENTS
`

export const milestoneNewCommand = defineCommand({
    name: 'milestone-new',
    description:
        'Start a new milestone cycle — gather goals, optionally research, define requirements, build the roadmap.',
    body: BODY,
})
