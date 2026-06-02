/**
 * gh-prepare skill — Ship committed work: ensure a changeset, push the feature branch, open a draft PR. Works standalone (outside the Luca pipeline) or within it. Use when user says "prepare", "ship this", "open a PR", "push and PR", or invokes /gh-prepare.
 *
 * Ported from ~/.claude/skills/gh-prepare/SKILL.md (current user copy) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# GH Prepare

Ship committed work to GitHub. Handles the mechanical steps between "code is done" and "PR is open": branch hygiene, changeset, push, and PR creation. No issue creation — that's external ideation handled by \`gh-issue-triage\`.

## Process

### 1. Detect context

\`\`\`bash
git remote -v                  # confirm GitHub remote exists
git branch --show-current      # current branch
git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo main  # default branch
git status --porcelain         # dirty tree check
git log --oneline origin/<defaultBranch>..HEAD 2>/dev/null  # commits ahead of default branch
\`\`\`

Gather:
- \`currentBranch\` — the branch we're on
- \`defaultBranch\` — usually \`main\`
- \`hasDirtyTree\` — uncommitted changes exist
- \`commitsAheadOfDefault\` — commits ahead of \`origin/<defaultBranch>\`
- \`hasUpstream\` — whether the current branch has a tracking upstream (\`git rev-parse --abbrev-ref @{u}\`)
- \`hasRemote\` — GitHub remote exists

If no GitHub remote is detected, stop and tell the user.

If the working tree is dirty, warn: "You have uncommitted changes. Commit or stash them first." Do not proceed with a dirty tree — changeset and PR diffs will be wrong.

If \`hasUpstream\` is true and there are no unpushed commits relative to the upstream (\`@{u}..HEAD\` is empty) AND the branch is already pushed, stop: "Nothing to ship — branch is up to date with its upstream."

If on the default branch and \`commitsAheadOfDefault\` is empty (HEAD matches \`origin/<defaultBranch>\`), stop: "Nothing to ship — HEAD is up to date with origin/<defaultBranch>."

### 2. Branch hygiene

**If on \`main\` or \`defaultBranch\`:**

The commits shouldn't have been made directly to main. Create a feature branch and move the commits onto it:

\`\`\`bash
# Determine branch name from commit messages
# Parse type from conventional commit prefix (feat, fix, refactor, chore)
# Slugify the first commit's subject for the branch name
git checkout -b <type>/<slug>
# The commits are now on the new branch; move local defaultBranch back to origin
git branch -f <defaultBranch> origin/<defaultBranch>
# This only rewrites the local branch ref; do not force-push
\`\`\`

Check whether the branch name already exists on the remote:
\`\`\`bash
git ls-remote --heads origin <branch-name>
\`\`\`
If it exists, warn and ask the user whether to reuse it or pick a different name.

**If already on a feature branch:**

Use the current branch as-is. No action needed.

### 3. Consult preferences

**At skill start**, read project preferences once and reuse the result:

\`\`\`
luca preferences read
\`\`\`

This prints the project's \`ProjectPreferences\` object (\`.luca/config.json#preferences\`, with \`ProjectPreferencesSchema\` defaults applied to unset sections). Destructure \`{ release, pr, tracker, commits, branching }\` and reuse them throughout this skill.

### 4. Changeset (if applicable)

Check whether the repo uses changesets (\`release.tool === 'changesets'\` AND \`.changeset/config.json\` exists):
\`\`\`bash
test -f .changeset/config.json
\`\`\`

If yes:
1. Check whether a changeset already exists for this work:
   \`\`\`bash
   find .changeset -maxdepth 1 -type f -name '*.md' ! -name 'README.md'
   \`\`\`
2. **Before writing a new changeset**, recall MuninnDB for changeset-authoring learnings (frontmatter conventions, package-name canonicalisation, per-package release-note patterns) — supplements the structured \`release\` preferences with historical pitfalls:

   \`\`\`
   mcp__muninn__muninn_recall({
     vault: "<repo_vault>",
     context: ["changeset format", "release-note pitfalls"],
     mode: "semantic",
     limit: 5
   })
   \`\`\`

   Resolve \`<repo_vault>\` from \`.luca/config.json\` → \`muninn.vault\`, falling back to \`"default"\`. Apply directly relevant findings. If MuninnDB is unreachable, log and continue — never block.
3. If no changeset exists, create one:
   - Determine the bump level from \`release.versionBump[<commit-type>]\`. The commit type comes from the branch prefix or the dominant commit type.
   - Read package names from \`.changeset/config.json\` \`"fixed"\` groups or workspace \`package.json\` files
   - Write \`.changeset/<slug>.md\` with the resolved bump level and summary
   - \`git add .changeset/<slug>.md && git commit -m "chore: add changeset"\`
4. If a changeset already exists, verify it looks correct (right packages, right bump level). Don't duplicate.

Skip if \`--no-changeset\` is provided or if no \`.changeset/config.json\` exists.

### 5. Push branch

\`\`\`bash
git push -u origin <branch-name>
\`\`\`

If the push fails (e.g. the branch already exists with divergent history), report the error and stop. Do not force-push.

### 6. Discover the linked issue

Check whether this work originated from a triaged GitHub issue:

1. **From the todo backlog**: run \`luca todo list\`, execute the printed \`mcp__muninn__muninn_recall\` instruction, and look for a todo whose work matches the current branch. If that todo has \`source: "gh-issue-#<N>"\`, that's the linked issue.
2. **From MuninnDB**: recall recent \`gh-prepare\` memories or pipeline state that reference an issue number for this branch.
3. **From the branch name**: if the branch is named \`feat/42-something\`, extract \`#42\` as a candidate and verify it exists: \`gh issue view 42 --json state\`.
4. **From commit messages**: scan for \`#N\` references.

If an issue is found, build the issue-link line from \`tracker.linkFormat\` (e.g. \`Closes #{issue}\` → \`Closes #42\`). If no issue is found, that's fine — not all work originates from an issue. Omit the line.

### 7. Create the draft PR

Render the PR title from \`pr.titleTemplate ?? pr.titleFormat\`. Substitute the project's tokens (\`{type}\`, \`{scope}\`, \`{version}\`, \`{issue}\`, \`{description}\`) with values derived from the branch and commits. If \`pr.forbidden[]\` is set, reject any title matching one of those patterns.

The \`--draft\` flag is governed by \`pr.draftByDefault\`:

\`\`\`bash
DRAFT_FLAG=""
if [ "<pr.draftByDefault>" = "true" ]; then DRAFT_FLAG="--draft"; fi
gh pr create $DRAFT_FLAG \\
  --title "<rendered title>" \\
  --body "<body>"
\`\`\`

PR body template (rendered from \`pr.bodyTemplate\` when present; default template below):

\`\`\`markdown
<tracker.linkFormat-rendered line, if a linked issue was found>

## What

<summary derived from commit messages — what changed>

## Why

<problem being solved, derived from commit messages and branch context>

## How

<brief technical approach, derived from diff stats>

## Test Plan

<how to verify — inferred from test files changed, or "Manual verification" if none>
\`\`\`

Derive \`type\` from the branch prefix or dominant commit type (validated against \`commits.types ?? branching.types\`). Derive \`scope\` from the primary package or area changed. Apply scope-allowlist validation only when \`commits.scopes.length > 0\` — an empty array means "no allowlist enforced" (any scope permitted), not "no scopes allowed".

### 8. Store in MuninnDB

Remember the result for later recall (by the pipeline, other sessions, or dedup). The \`gh-prepare\` concept is project-scoped — it routes to the **repo** vault:

\`\`\`
mcp__muninn__muninn_remember({
  vault: "<repo_vault>",
  concept: "gh-prepare",
  content: "Shipped: branch <name>, PR #<M> (<url>). <Closes #N if linked.> Work: <description>",
  tags: ["gh-prepare", "branch", "pr"],
  entities: [
    { name: "pr-<M>", type: "github-pr" },
    { name: "<branch-name>", type: "git-branch" }
  ]
})
\`\`\`

### 9. Pipeline integration

Run \`luca state read\`. If a Luca pipeline is active (\`pipelineStep\` is not \`idle\`), later pipeline steps discover this PR by recalling the \`gh-prepare\` memory from Step 8 — no separate workflow-state write is needed. If no pipeline is active, skip — the skill works standalone.

### 10. Report

Print a clean summary:

\`\`\`
Branch: feat/42-add-webhook-support (pushed)
PR:     #43 (draft) — https://github.com/<owner>/<repo>/pull/43
Issue:  Closes #42 on merge
\`\`\`

Or, if no linked issue:

\`\`\`
Branch: feat/add-webhook-support (pushed)
PR:     #43 (draft) — https://github.com/<owner>/<repo>/pull/43
\`\`\`

## Flags

| Flag | Effect |
|------|--------|
| \`--no-changeset\` | Skip changeset creation even if \`.changeset/config.json\` exists |
| \`--no-pr\` | Push the branch only, skip PR creation |
| \`--title="..."\` | Override the PR title |
| \`--issue=<N>\` | Explicitly link to issue #N instead of auto-discovering |
`

export const ghPrepareSkill = defineSkill({
    name: "gh-prepare",
    description: "Ship committed work: ensure a changeset, push the feature branch, open a draft PR. Works standalone (outside the Luca pipeline) or within it. Use when user says \"prepare\", \"ship this\", \"open a PR\", \"push and PR\", or invokes /gh-prepare.",
    body: BODY,
})
