# pr-fetch

Resolve PR context and fetch all comment types from GitHub for the pr-address sub-skill chain.

## main

<main>
# pr-fetch — Fetch PR Comments and Context

Resolve the PR number and fetch all comments, reviews, and diff from GitHub. Write results to the shared context file.

## Context File Protocol

This sub-skill is part of the pr-address chain. It reads/writes the shared context file at `/tmp/pr-address-context.json`.

**Read:** Call `readPrContext()` from `src/skills/__schemas/pr-address-context.schemas.ts`. If `success: false`, ABORT immediately — do not proceed with stale or missing context.

**Write:** Call `writePrContext({ pr_fetch: { ... } })` to populate the `pr_fetch` section.

## Process

### Step 0: Resolve PR Context

```bash
# If PR URL/number provided in args, use it
# Otherwise, detect from current branch
PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null)
PR_URL=$(gh pr view --json url -q '.url' 2>/dev/null)

if [ -z "$PR_NUMBER" ]; then
  echo "ERROR: No PR found for current branch."
  echo "Either provide a PR URL/number or ensure you're on a branch with an open PR."
  # ABORT — write nothing to context file
  exit 1
fi
```

If user provides PR URL or number via args, parse and use that instead.

### Step 1: Fetch PR Comments

Fetch all comment types from the PR:

```bash
# Get repository info
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')

# Fetch PR review comments (inline code comments)
gh api "/repos/${REPO}/pulls/${PR_NUMBER}/comments" > /tmp/pr_review_comments.json

# Fetch PR issue comments (general PR discussion)
gh api "/repos/${REPO}/issues/${PR_NUMBER}/comments" > /tmp/pr_issue_comments.json

# Fetch PR reviews with their comments
gh api "/repos/${REPO}/pulls/${PR_NUMBER}/reviews" > /tmp/pr_reviews.json

# Fetch PR diff for code context
gh pr diff ${PR_NUMBER} > /tmp/pr_diff.txt
```

### Step 1.5: Filter Actionable Comments

Parse and consolidate comments. Filter for actionable comments:
- Not from the PR author (skip self-comments)
- Not marked as resolved
- Contains actionable feedback (not just "LGTM", "looks good", thumbs up)
- Not from bots (GitHub Actions, dependabot, etc.)

### Step 1.9: Write to Context File

Write the fetched data to the shared context file:

```typescript
import { writePrContext } from "src/skills/__schemas/pr-address-context.schemas";

await writePrContext({
  pr_fetch: {
    pr_number: PR_NUMBER,
    repo: REPO,
    review_comments: reviewComments,
    issue_comments: issueComments,
    reviews: reviews,
    diff: diffText,
    actionable_comments: actionableComments,
  },
});
```

## Output

On success, the context file at `/tmp/pr-address-context.json` will contain:

```json
{
  "context_version": 1,
  "pr_fetch": {
    "pr_number": 123,
    "repo": "owner/repo",
    "review_comments": [...],
    "issue_comments": [...],
    "reviews": [...],
    "diff": "...",
    "actionable_comments": [...]
  }
}
```

## Error Handling

- **No PR found:** Print error message and ABORT. Do not write to context file.
- **GitHub API failure:** Print error details and ABORT. Partial data is worse than no data.
- **Rate limit:** Print rate limit message and ABORT.

## Constraints

- This is a **leaf skill** — do NOT spawn sub-agents via Task()
- Do NOT categorize or validate comments — that is pr-validate's responsibility
- Do NOT modify any code files — this skill only reads from GitHub
</main>