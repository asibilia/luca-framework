/**
 * gh-issue-triage skill — Pull open GitHub issues into the MuninnDB todo backlog for pipeline execution. Filters out issues labeled `skip-triage`, deduplicates against existing todos, and links each todo back to its originating issue so the PR can close it on merge. Use when user says "triage issues", "pull in issues", "import issues", "sync issues to todos", or invokes /gh-issue-triage.
 *
 * Ported from ~/.claude/skills/gh-issue-triage/SKILL.md (current user copy) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# GH Issue Triage

Pull open GitHub issues into the **MuninnDB todo backlog** so the Luca pipeline can pick them up. Each issue becomes a \`todo:*\` memory; when the pipeline ships a PR it closes the originating issue automatically via \`Closes #N\`.

## Process

### 1. Fetch open issues

\`\`\`bash
gh issue list --state open --json number,title,body,labels,assignees,createdAt --limit 100
\`\`\`

If no GitHub remote is detected, stop and tell the user.

### 2. Load existing todos (for dedup)

Run \`luca todo list\`. It prints a \`mcp__muninn__muninn_recall\` instruction blob — execute it exactly as returned. Each recalled memory's \`content\` is JSON conforming to \`TodoSchema\`; collect every existing todo's \`source\` field. This is the dedup set for step 5.

### 3. Filter

Remove issues that should not become todos:

- **\`skip-triage\`** label — explicitly excluded from automatic triage
- **Pull requests** — \`gh issue list\` may include PRs on some repos; filter by \`pull_request\` field if present
- **Already triaged** — drop any issue whose \`gh-issue-#<N>\` already appears in the dedup set from step 2

If \`$ARGUMENTS\` contains filter terms (e.g. a label name, milestone, or assignee), apply them:

\`\`\`bash
gh issue list --state open --label "<label>" ...
\`\`\`

### 4. Present candidates

Show the filtered list to the user:

\`\`\`
## Issues Ready for Triage

1. #42 — Add webhook support [enhancement] (2 days ago)
2. #38 — Login fails on Safari [bug] (5 days ago)
3. #35 — Refactor auth module [refactor] (1 week ago)

Skipped: 2 issues (skip-triage), 1 already in backlog

Import all, or select by number?
\`\`\`

Wait for the user to confirm which issues to import. Accept "all" or a comma-separated list of numbers.

### 5. Create todos

For each approved issue, stage the \`metadata\` object in a JSON file and run \`luca todo add\`:

\`\`\`
# .luca/tmp/todo-meta.json:
# { "priority": "<high|medium|low>", "area": "<ui|api|infra|...>" }
luca todo add \\
  --title "<issue title>" \\
  --body "> GitHub Issue: #<N> — <url>

<issue body, trimmed to essentials>" \\
  --source "gh-issue-#<N>" \\
  --metadata-file .luca/tmp/todo-meta.json
\`\`\`

- **\`--source\`** is \`gh-issue-#<N>\` — the link back to the originating issue. It carries the issue number through the entire pipeline.
- **\`priority\`** is inferred from labels (\`critical\`/\`bug\` → \`high\`, \`enhancement\` → \`medium\`, unlabeled → \`medium\`) and goes in the metadata file.
- **\`area\`** is inferred from labels when recognizable (\`ui\`, \`api\`, \`infra\`) and goes in the metadata file.

\`luca todo add\` validates the input and prints a \`mcp__muninn__muninn_remember\` instruction blob — execute that instruction **exactly as returned** to persist the todo. The todo \`id\` is derived from the title (kebab-slug).

### 6. Report

Print a summary of what was imported:

\`\`\`
## Triage Complete

Created 3 todos from GitHub issues:
  - #42 → todo: add-webhook-support (pending)
  - #38 → todo: login-fails-on-safari (pending, priority: high)
  - #35 → todo: refactor-auth-module (pending)

Skipped: 1 duplicate (#31 already exists as a todo)

Next: run /lu to start working through the backlog.
\`\`\`

## Closing the loop

When work ships a PR for a todo whose \`source\` is \`gh-issue-#<N>\`, the PR body must include \`Closes #<N>\` so the issue closes on merge. The \`gh-prepare\` skill reads the todo's \`source\` field to render that line — the \`source\` is the carrier that links issue → todo → PR.
`

export const ghIssueTriageSkill = defineSkill({
    name: "gh-issue-triage",
    description: "Pull open GitHub issues into the MuninnDB todo backlog for pipeline execution. Filters out issues labeled `skip-triage`, deduplicates against existing todos, and links each todo back to its originating issue so the PR can close it on merge. Use when user says \"triage issues\", \"pull in issues\", \"import issues\", \"sync issues to todos\", or invokes /gh-issue-triage.",
    body: BODY,
})
