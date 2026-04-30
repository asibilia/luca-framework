---
name: gh-prepare
description: >
  Create a linked GitHub issue, feature branch, and draft PR for the current work — all wired
  together. Works standalone (outside the Luca pipeline) or within it. Use when user says
  "prepare", "set up branch and issue", "create issue and PR", "prepare github",
  "link issue to PR", or invokes /gh-prepare.
---

# GH Prepare

Create a linked GitHub issue + feature branch + draft PR in one shot. The PR body references
`Closes #<issue>` so merging auto-closes the issue. This is the standalone version of what the
Luca pipeline's architect mode does in Step 1 — use it when working outside the pipeline.

## Process

### 1. Detect Context

```bash
git remote -v              # confirm GitHub remote exists
git branch --show-current  # current branch
git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo main  # default branch
git status --porcelain     # dirty tree check
```

If working tree is dirty, warn but don't block — the user may want to prepare before committing.

If no GitHub remote detected, stop and tell the user.

### 2. Parse Arguments

Accept freeform description from `$ARGUMENTS`. Infer:

- **Type**: `feat` / `fix` / `refactor` / `chore` (default `feat`)
- **Title**: concise summary for the issue
- **Labels**: inferred from type + description (e.g., `bug` for fix, `enhancement` for feat)

Optional flags:
- `--no-pr` — skip PR creation (issue + branch only)
- `--no-issue` — skip issue creation (branch + PR only, for when issue already exists)
- `--no-branch` — skip branch creation (issue only)
- `--type=<type>` — override inferred type
- `--issue=<number>` — link to an existing issue instead of creating one

### 3. Check for Existing Work

Before creating anything:

1. If already on a feature branch (e.g., `feat/42-...`), ask: reuse this branch or create a new one?
2. If `--issue=<N>` provided, verify the issue exists via `gh issue view <N>` and use it directly

### 4. Create GitHub Issue

Skip if `--no-issue` or `--issue=<N>` provided.

```bash
gh issue create \
  --title "<title>" \
  --label "<labels>" \
  --body "<body>"
```

Issue body template:

```markdown
## Problem

<what needs to change and why, derived from the user's description>

## Proposed Solution

<high-level approach>

## Acceptance Criteria

- [ ] <criterion derived from description>
```

Capture the issue number from the output.

### 5. Create Feature Branch

Skip if `--no-branch`.

```bash
git checkout -b <type>/<issue-number>-<slug>
git push -u origin <type>/<issue-number>-<slug>
```

Branch naming follows project conventions: `feat/42-add-webhook-support`, `fix/17-null-check`.

### 6. Create Draft PR

Skip if `--no-pr`.

```bash
gh pr create --draft \
  --title "<type>(scope): <short description>" \
  --body "<body>"
```

PR body template:

```markdown
Closes #<issue-number>

## What

<summary of the change>

## Why

<problem being solved, links to issue>

## How

_TBD — will be filled as implementation progresses._

## Test Plan

_TBD_
```

The `Closes #<issue>` line is **mandatory** — it's the link between PR and issue.

### 7. Changeset (if applicable)

If the repo uses changesets (`.changeset/config.json` exists), create one:

```bash
# Check for changeset config
if [ -f .changeset/config.json ]; then
  # Determine bump level from type: feat → minor, fix → patch, chore → patch
  # Read package names from config.json "fixed" or workspace package.json files
fi
```

Write `.changeset/<slug>.md` with the appropriate bump level and summary. Include it in the commit or amend the branch's first commit.

Skip if `--no-changeset` flag is provided or if no `.changeset/config.json` exists.

### 8. Store in MuninnDB

Remember for later recall (by finalize mode, other sessions, or `/gh-prepare` dedup):

```
muninn_remember(
  vault: "<repo_vault>",
  concept: "gh-prepare",
  content: "GitHub setup: issue #<N> (<url>), branch <name>, PR #<M> (<url>). Work: <description>",
  tags: ["gh-prepare", "issue", "branch", "pr"],
  entities: [
    { name: "issue-<N>", type: "github-issue" },
    { name: "pr-<M>", type: "github-pr" },
    { name: "<branch-name>", type: "git-branch" }
  ]
)
```

### 9. Pipeline Integration

If `.planning/luca-state.json` exists (Luca pipeline is active), also update workflow state with the issue number and branch name so finalize mode can find them. If not active, skip — the skill works independently.

### 10. Report

Print a clean summary:

```
Issue:  #42 — https://github.com/<owner>/<repo>/issues/42
Branch: feat/42-add-webhook-support
PR:     #43 (draft) — https://github.com/<owner>/<repo>/pull/43
        PR auto-closes #42 on merge.
```
