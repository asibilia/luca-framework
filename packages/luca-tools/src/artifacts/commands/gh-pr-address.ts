/**
 * gh-pr-address slash command — Address PR review comments — fetch, filter stale, categorize, fix, respond, regression-check.
 *
 * Ported from ~/.claude/commands/gh-pr-address.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /gh-pr-address

Address PR review comments by fetching them, dropping stale ones, categorizing by severity, implementing fixes, posting replies, and verifying the fix iteration introduced no regressions.

## Parse arguments

Parse \`$ARGUMENTS\` for:

- A **PR number** (e.g. \`42\`) or **PR URL** (e.g. \`https://github.com/owner/repo/pull/42\`)
- \`--dry-run\` — show categorized comments and planned fixes without executing
- \`--skip-validation\` — skip categorization; treat all comments as actionable
- \`--no-respond\` — fix issues but don't post reply comments

If no PR number or URL is provided, detect it from the current branch:

\`\`\`bash
gh pr view --json number,url
\`\`\`

Resolve \`<repo_vault>\` from \`.luca/config.json\` → \`muninn.vault\`, falling back to \`"default"\`.

## Step 1 — Fetch PR data

Fetch all reviews and review comments:

\`\`\`bash
gh pr view <number> --json reviews,comments,reviewDecision,title,body,number,url
gh api repos/{owner}/{repo}/pulls/<number>/comments --paginate
\`\`\`

Group the results:

- **Review comments** — inline code comments with file/line context (the \`gh api pulls/<n>/comments\` shape).
- **General comments** — conversation-level feedback.
- **Duplicates** — the same concern on different lines; group by content similarity and track every comment id in the group.

Build a comment map with fields: \`commentId, author, body, file, line, inReplyTo, isDuplicate, duplicateGroupId\`.

**Snapshot the iteration boundary.** Record the current \`git rev-parse HEAD\` SHA as \`iterationStartSha\` and the current time as \`iterationStartTime\` (ISO 8601). Step 7 uses the SHA to compute which paths the iteration modified and the timestamp to filter newly-created comments.

## Step 1.5 — Filter stale comments

Comments filed against an earlier commit may already be addressed by later fix commits on the branch. Acting on them wastes iteration cycles.

Run the stale-comment filter on the **review comments** (the raw \`gh api pulls/<n>/comments\` objects — each carries \`id, path, line, original_line, commit_id, original_commit_id, diff_hunk, body, in_reply_to_id?, user?\`). Stage the review comments array in a JSON file, then run \`luca pr-review filter-stale --file\`:

\`\`\`
# .luca/tmp/pr-comments.json holds the review comments array from Step 1
luca pr-review filter-stale --file .luca/tmp/pr-comments.json
\`\`\`

The command partitions them into four buckets:

- **\`actionable\`** — cited code still exists at the same location. Continue with categorization for these.
- **\`stale\`** — cited code was rewritten, removed, or relocated beyond the drift tolerance. **Skip categorization.** When responding (Step 5), reply that the comment is stale and point at the commit that addressed the underlying code.
- **\`replies\`** — comments with \`in_reply_to_id\` set; pass through, not first-class findings.
- **\`unknown\`** — could not be re-anchored; treat conservatively as actionable.

Append a note to the Step 2 audit summary: \`Stale: <n> comments (skipped from categorization)\`.

## Step 2 — Categorize comments

Unless \`--skip-validation\` is set, classify each unique actionable comment (deduplicated):

| Category | Action | Examples |
|----------|--------|---------|
| **security** | Must fix | Vulnerabilities, injection, credential exposure |
| **bug** | Must fix | Logic errors, regressions, broken behavior |
| **requirement** | Must fix | Missing acceptance criteria, spec violations |
| **style** | Should fix | Naming, formatting, established pattern violations |
| **improvement** | Should fix | Better approach, DX, readability |
| **question** | Respond only | Clarification requests, design rationale questions |
| **nit** | Optional | Trivial preferences, minor suggestions |
| **praise** | Respond only | Positive feedback |

Present a summary:

\`\`\`
## PR #<number> Comment Audit

Must Fix: N comments (security: N, bug: N, requirement: N)
Should Fix: N comments (style: N, improvement: N)
Respond Only: N comments (question: N, praise: N)
Nit: N comments
Stale: N comments (skipped from categorization)

Total: N unique comments (N duplicates grouped)
\`\`\`

If \`--dry-run\`, stop here.

## Step 2.5 — Detect cross-perspective convergence

When two or more independent reviewer perspectives flag the same location, that location is materially more likely to be a real issue. Auto-promote severity so converged findings are treated as must-fix.

Build a \`findings\` array — one entry per actionable comment, plus any findings from other perspectives this iteration has access to. If a pipeline phase is active, include the \`reviewer\` MUST-FIX/SHOULD-FIX entries from \`.luca/phases/<NN-slug>/audits/*.md\`. Map each to:

\`\`\`
{
  id:          <stable id, e.g. comment id or "reviewer:<n>">,
  perspective: <who produced it, e.g. "Copilot", "reviewer">,
  path:        <file path>,
  line:        <line number>,
  severity:    <"must-fix" | "should-fix" | "nit" | "style" | "improvement" | ...>,
  category:    <"security" | "bug" | "style" | ...>,
  summary:     <short description>
}
\`\`\`

Run convergence detection. Stage the findings array in a JSON file, then run \`luca pr-review detect-convergence --file\`:

\`\`\`
# .luca/tmp/pr-findings.json holds the findings array
luca pr-review detect-convergence --file .luca/tmp/pr-findings.json --line-tolerance 2
\`\`\`

For each entry in the returned \`report.promotions\`:

- Find the corresponding categorized comment in your audit map.
- Update its severity to **must-fix** (regardless of its original severity), preserving the original category. Add a note: \`Promoted via convergence with <other perspectives>\`.
- Surface it in the audit summary: \`Converged: <n> findings promoted to must-fix via 2+ perspectives\`.

Continue to Step 3 with the promoted findings.

## Step 3 — Plan fixes

For comments with severity **must fix** and **should fix**:

1. Group by file for efficient execution.
2. Determine the fix approach for each comment.
3. Order by severity: security → bug → requirement → style → improvement.

## Step 4 — Execute fixes

Spawn **\`executor\`** subagents (one per file group) via the \`Agent\` tool. Each subagent receives:

- The file path and the relevant comment details (body, line, category).
- Instructions to fix each issue and commit using the project's commit convention. Read it first by running \`luca preferences read\` and using the \`commits\` section (\`convention\`, \`types\`, \`scopes\`, \`trailers\`, \`subjectMaxLength\`). Reference the PR number per \`commits.trailers.issueRef\` when set; the executor adds the \`Co-Authored-By\` trailer automatically when \`commits.trailers.coAuthor === true\`.

After all executor subagents complete, run a type check:

\`\`\`bash
bunx --bun tsc --noEmit
\`\`\`

If the type check fails, fix the errors before proceeding.

## Step 5 — Respond to comments

Unless \`--no-respond\` is set, post replies to **every** PR comment thread (including all duplicate ids in each group):

- **Fixed comments** → reply with what changed and which commit addresses it.
- **Stale comments** → reply that the comment is stale and point at the commit that already addressed the code.
- **Question comments** → reply with an answer based on codebase context.
- **Nit comments** → acknowledge briefly (applied or noted).
- **Praise comments** → thank and acknowledge briefly.

Post inline review-comment replies:

\`\`\`bash
gh api repos/{owner}/{repo}/pulls/<number>/comments/<commentId>/replies -f body="<reply>"
\`\`\`

Post top-level (conversation) replies:

\`\`\`bash
gh api repos/{owner}/{repo}/issues/<number>/comments -f body="<reply>"
\`\`\`

## Step 6 — Push and verify

1. Push the fixes: \`git push\`
2. Verify zero unreplied threads remain:

   \`\`\`bash
   gh api repos/{owner}/{repo}/pulls/<number>/comments --paginate
   \`\`\`

   Check that every comment thread has a reply. Report any gaps.

## Step 7 — Iteration-N regression check

Fix commits sometimes introduce new issues the original review didn't flag. Catch them now instead of paying for another full review pass.

1. **Re-fetch all PR comments:**

   \`\`\`bash
   gh api repos/{owner}/{repo}/pulls/<number>/comments --paginate
   \`\`\`

   If the PR has automated reviewer hooks (Copilot, CodeRabbit, etc.) that re-run on push, allow a brief settle window (~30s) before re-fetching.

2. **Build before/after finding arrays.** The \`before\` array is the \`findings\` array from Step 2.5 (pre-iteration state). The \`after\` array is built the same way from the freshly-fetched comments — include only comments with \`created_at >= iterationStartTime\` to filter out persistent prior findings.

3. **Run the regression check** (it computes touched paths from the SHA range via \`git diff\`). Stage the full payload object in a JSON file, then run \`luca pr-review regression-check --file\`:

   \`\`\`
   # .luca/tmp/pr-regression.json holds:
   # {
   #   "before":   <pre-iteration findings>,
   #   "after":    <post-iteration findings>,
   #   "from_sha": "<iterationStartSha>",
   #   "to_sha":   "HEAD"
   # }
   luca pr-review regression-check --file .luca/tmp/pr-regression.json
   \`\`\`

4. **Handle the verdict.**

   - No regressions (exit \`0\`, \`report.regressions\` empty) → iteration complete. Report \`<n> resolved, <n> unchanged, <n> new on untouched paths\` in the final summary.
   - Regressions present (exit \`1\`, \`report.regressions\` non-empty) → fix commits introduced new findings. **Do not declare the iteration complete.** Re-enter Step 3 (Plan fixes) with \`report.regressions\` as the input set. The regression cycle is bounded — if 3 consecutive iterations fail this check, escalate to the user with a summary of what's regressing and pause the loop.

## Step 8 — Store learnings

Store **recurring patterns** in MuninnDB (skip one-off fixes). The \`pattern:*\` prefix routes to the \`"default"\` vault per the vault-routing rule:

\`\`\`
mcp__muninn__muninn_remember_batch({
  vault: "default",
  memories: [
    {
      concept: "pattern:pr-review-<category>",
      content: "<description of the recurring review-feedback pattern>",
      tags: ["pr-review", "<category>"]
    }
  ]
})
\`\`\`

$ARGUMENTS
`

export const ghPrAddressCommand = defineCommand({
    name: 'gh-pr-address',
    description:
        'Address PR review comments — fetch, filter stale, categorize, fix, respond, regression-check.',
    body: BODY,
})
