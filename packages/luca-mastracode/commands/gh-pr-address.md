---
name: gh-pr-address
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

**Snapshot the iteration boundary.** Record the current `git rev-parse HEAD` SHA as `iterationStartSha` and the current time as `iterationStartTime` (ISO 8601, e.g. `2026-04-30T16:00:00Z`). Step 7 uses the SHA to compute which paths the iteration modified (via `git diff`) and the timestamp to filter newly-created comments.

### Step 1.5 — Filter Stale Comments

Comments filed against an earlier commit may already be addressed by subsequent fix commits on the branch. Treating them as actionable wastes iteration cycles and produces confused replies.

Run the stale-comment filter:

```
prReview(action: "filter-stale", comments: <all comments fetched in Step 1>)
```

The tool returns three buckets:
- **`actionable`** — comments whose cited code still exists in the working tree at the same location. Continue with categorization for these.
- **`stale`** — comments whose cited code has been rewritten, removed, or relocated by more than 5 lines. **Skip categorization for these — they cannot be acted on.** When responding (Step 5), post a reply explaining the comment is stale and pointing at the commit that addressed the underlying code.
- **`replies`** — comments with `in_reply_to_id` set; pass through, not first-class findings.

Append a note to the comment audit summary at Step 2: `Stale: <n> comments (skipped from categorization)`.

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

### Step 2.5 — Detect Cross-Perspective Convergence

When two or more independent reviewer perspectives flag the same location, that location is materially more likely to be a real issue. Auto-promote severity so converged findings are treated as MUST-FIX rather than as independent SHOULD-FIX items.

Build a `findings` array from the categorized comments — one entry per actionable comment, plus any findings from other perspectives this iteration has access to (e.g. `claim-verifier` output, the reviewer agent's MUST-FIX/SHOULD-FIX entries from `.planning/REVIEW-*.md`). Map each to:

```
{
  id:         <stable id, e.g. comment id or "claim-verifier:<n>">,
  perspective:<who produced it, e.g. "Copilot", "claim-verifier", "reviewer-agent">,
  path:       <file path>,
  line:       <line number>,
  severity:   <"must-fix"|"should-fix"|"nit"|"style"|"improvement"|...>,
  category:   <"security"|"bug"|"style"|...>,
  summary:    <short description>,
}
```

Run convergence detection:

```
prReview(action: "detect-convergence", findings: <array>, lineTolerance: 2)
```

For each promotion the tool returns:
- Find the corresponding categorized comment in your audit map.
- Update its severity to **must-fix** (regardless of its original severity), preserving the original category (e.g. `style`, `improvement`). Add a note: `Promoted via convergence with <other perspectives>`.
- Surface the promotion in the comment audit summary: `Converged: <n> findings promoted to must-fix via 2+ perspectives`.

Continue to Step 3 with the promoted findings.

### Step 3 — Plan Fixes

For comments with severity **must fix** and **should fix**:
1. Group by file for efficient execution
2. Determine the fix approach for each comment
3. Order by severity: security → bug → requirement → style → improvement

### Step 4 — Execute Fixes

Spawn **executor** subagents per file group. Each subagent receives:
- The file path and relevant comment details (body, line, category)
- Instructions to fix each issue and commit using the project's commit convention (consult `projectPreferences({ action: "consult-section", section: "commits", fallback: true })` for `convention`, `types`, `scopes`, `trailers`, `subjectMaxLength`). Reference the PR number per `commits.trailers.issueRef` when set; the executor subagent will add the Co-Authored-By trailer automatically when `commits.trailers.coAuthor === true`.

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

### Step 7 — Iteration-N Regression Check

Fix commits sometimes introduce new issues that the original review didn't flag. Without this check, those new findings only surface in the *next* review pass, costing another full iteration. Catch them now.

1. **Snapshot the post-iteration findings.** Re-fetch all PR comments:
   ```bash
   gh api repos/{owner}/{repo}/pulls/<number>/comments --paginate
   ```
   If the PR has automated reviewer hooks (Copilot, CodeRabbit, etc.) configured to re-run on push, allow a brief settle window (~30s) before re-fetching.

2. **Build before/after finding arrays.** The `before` array is the same `findings` array you built at Step 2.5 (pre-iteration state). The `after` array is built the same way from the freshly-fetched comments — but include only comments with `created_at >= iterationStartTime` to filter out persistent prior findings.

3. **Compute touched paths** between the iteration boundary and the current HEAD:
   ```
   prReview(
     action: "regression-check",
     before:  <pre-iteration findings>,
     after:   <post-iteration findings>,
     fromSha: <iterationStartSha>,
     toSha:   "HEAD"
   )
   ```

4. **Handle the verdict.**

   - `success: true` → iteration complete. Report `<n> resolved, <n> unchanged, <n> new on untouched paths` in the final summary.
   - `success: false` (`PR_REVIEW_REGRESSION_DETECTED`) → fix commits introduced new findings. **Do not declare the iteration complete.** Re-enter Step 3 (Plan Fixes) with `report.regressions` as the input set. The regression cycle is bounded — if 3 consecutive iterations fail this check, escalate to the user with a summary of what's regressing and pause the loop.

### Step 8 — Store Learnings

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
