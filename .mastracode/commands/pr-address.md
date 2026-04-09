---
name: pr-address
description: Address PR review comments — fetch, categorize, fix, and respond
---
Address PR review comments by fetching them, categorizing by severity, implementing fixes, and posting replies.

## Parse Arguments

Parse `$ARGUMENTS` for:
- A **PR number** (e.g., `42`) or **PR URL** (e.g., `https://github.com/owner/repo/pull/42`)
- `--dry-run` — show categorized comments and planned fixes without executing
- `--skip-validation` — skip the categorization step, treat all comments as actionable
- `--no-respond` — fix issues but don't post reply comments

If no PR number or URL is provided, detect from the current branch:
```
gh pr view --json number,url
```

## Steps

### Step 1 — Fetch PR Data

Fetch all review comments and reviews:

```bash
gh pr view <number> --json reviews,comments,reviewDecision,title,body,number,url
gh api repos/{owner}/{repo}/pulls/<number>/comments --paginate
```

Parse and group comments:
- **Review comments** — inline code comments with file/line context
- **General comments** — conversation-level feedback
- **Duplicates** — same concern on different lines; group by content similarity and track all comment IDs in the group

Build a comment map with fields: `commentId, author, body, file, line, inReplyTo, isDuplicate, duplicateGroupId`.

### Step 2 — Categorize Comments

Unless `--skip-validation` is set, classify each unique comment (deduplicated):

| Category | Action | Examples |
|----------|--------|---------|
| **security** | Must fix | Vulnerabilities, injection, credentials exposure |
| **bug** | Must fix | Logic errors, regressions, broken behavior |
| **requirement** | Must fix | Missing acceptance criteria, spec violations |
| **style** | Should fix | Naming, formatting, established pattern violations |
| **improvement** | Should fix | Better approach, DX, readability |
| **question** | Respond only | Clarification requests, design rationale questions |
| **nit** | Optional | Trivial preferences, minor suggestions |
| **praise** | Respond only | Positive feedback |

Present a summary:
```
## PR #<number> Comment Audit

Must Fix: N comments (security: N, bug: N, requirement: N)
Should Fix: N comments (style: N, improvement: N)
Respond Only: N comments (question: N, praise: N)
Nit: N comments

Total: N unique comments (N duplicates grouped)
```

If `--dry-run`, stop here.

### Step 3 — Plan Fixes

For comments categorized as **must fix** and **should fix**:
1. Group by file for efficient execution
2. Determine the fix approach for each comment
3. Order by severity: security → bug → requirement → style → improvement

### Step 4 — Execute Fixes

Spawn **executor** subagents per file group. Each subagent receives:
- The file path and relevant comment details (body, line, category)
- Instructions to fix each issue and commit with a conventional commit message referencing the PR number (the executor subagent will add the Co-Authored-By trailer automatically)

After all executor subagents complete, run a type check:
```bash
bunx --bun tsc --noEmit
```

If the type check fails, fix the errors before proceeding.

### Step 5 — Respond to Comments

Unless `--no-respond` is set, post replies to **every** PR comment thread (including all duplicate IDs in each group):

- **Fixed comments** → Reply with what was changed and which commit addresses it
- **Question comments** → Reply with an answer based on codebase context
- **Nit comments** → Acknowledge with a brief response (applied or noted)
- **Praise comments** → Thank and acknowledge briefly

Post replies via the GitHub API:
```bash
gh api repos/{owner}/{repo}/pulls/<number>/comments/<commentId>/replies -f body="<reply>"
```

For top-level review comments (not inline), use:
```bash
gh api repos/{owner}/{repo}/issues/<number>/comments -f body="<reply>"
```

### Step 6 — Push and Verify

1. Push the fixes: `git push`
2. Verify zero unreplied threads remain:
   ```bash
   gh api repos/{owner}/{repo}/pulls/<number>/comments --paginate
   ```
   Check that every comment thread has a reply. Report any gaps.

### Step 7 — Store Learnings

Store **recurring patterns** in MuninnDB (skip one-off fixes):

```
mcp__muninn__muninn_remember_batch(
  vault: <repo_vault>,
  memories: [
    {
      concept: "pattern:pr-review-<category>",
      content: "<description of recurring review feedback pattern>",
      tags: ["pr-review", "<category>"]
    }
  ]
)
```

Determine the repo vault name from `.planning/config.json` → `muninn.vault` field, or fall back to `"default"`.

$ARGUMENTS
