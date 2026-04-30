---
'@alecsibilia/luca-mastracode': minor
---

Harden the `/pr-address` command loop against three measured failure modes: stale Copilot comments, missed cross-perspective convergence, and fixes that introduce new regressions.

**Stale-comment filter** (`pr-review/stale-filter.ts`)

Across the PR-review corpus, ~57% of inline comments on iterated PRs are stale — they cite code that has already been changed by an earlier fix iteration. Treating them as still-actionable burns iteration cycles and produces confused replies.

The filter classifies each comment by re-reading the cited file, parsing the `diff_hunk`, and locating the post-state anchor lines in the current working tree. A comment is stale when:

- The cited file no longer exists.
- The diff hunk's anchor lines (context + added) cannot be found within ±50 lines of the cited line.
- The anchor location has drifted by more than 5 lines.
- The cited commit_id is older than HEAD AND the path was modified between commit_id and HEAD AND fewer than 85% of anchors match.

Verified on PR #195 (which had fixes pushed after Copilot's review): correctly classified 9 of 10 comments as stale and left 1 still-actionable.

**Cross-perspective convergence** (`pr-review/convergence.ts`)

Today, when Copilot, the reviewer agent, and the project's claim verifier each flag the same line, the harness treats the three findings as independent SHOULD-FIX items. They should be MUST-FIX.

The detector groups findings by `(path, line ± lineTolerance)`. Findings authored by ≥2 distinct perspectives in the same group get severity promoted to `must-fix`. Findings already at must-fix are tagged with `must-fix-converged` for evidence rendering. Single-perspective groups are pass-through.

**Iteration-N regression check** (`pr-review/regression.ts`)

Catches the case where a fix commit introduces a new finding — currently, that's only detected on the *next* review pass, costing another iteration cycle.

Given pre-iteration findings, post-iteration findings, and the list of paths the iteration touched (or `fromSha`/`toSha` to compute it), the check returns:

- `regressions` — new findings on touched paths, or severity escalations of persistent findings
- `resolved` — findings present before, gone after (the iteration's wins)
- `unchanged` — present in both
- `newButUntouched` — new findings on paths the iteration didn't modify (likely external; not blocking)

Any regressions block iteration completion and re-enter the fix loop.

**Tool surface** (`tools/pr-review.ts`)

New `prReview` Mastra tool with three actions: `filter-stale`, `detect-convergence`, `regression-check`. Every call appends a `pr-review-run` ledger event for postmortem visibility. Available in `build` and `fast` modes (where slash commands run).

**`/pr-address` integration** (`commands/pr-address.md`)

- Step 1.5: filter stale comments before categorization.
- Step 2.5: detect convergence and promote severity before planning fixes.
- Step 7: regression check after push, blocking iteration completion if fixes introduced new findings. Bounded retry (3 iterations) before escalating to user.

The command also now snapshots the iteration-start SHA at Step 1 so the regression check can compute the precise iteration delta.
