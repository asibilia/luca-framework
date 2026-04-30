---
'@alecsibilia/luca-framework': patch
'@alecsibilia/luca-mastracode': patch
---

Harden the `/pr-address` command with three new defensive steps that wire into the existing `prReview` tool, plus a small grammar fix in the caveman skill.

**`/pr-address` enhancements** (`.mastracode/commands/pr-address.md`):

- **Step 1.5 — Filter Stale Comments.** Calls `prReview(action: "filter-stale", ...)` immediately after fetching PR comments. Comments whose cited code has been rewritten, removed, or relocated by more than 5 lines are bucketed as `stale` and skipped from categorization; the agent posts a reply pointing at the addressing commit instead of treating them as actionable. Prevents wasted iteration cycles on already-fixed feedback.
- **Step 2.5 — Detect Cross-Perspective Convergence.** Calls `prReview(action: "detect-convergence", findings, lineTolerance: 2)` over the categorized comments combined with findings from other perspectives (claim-verifier output, reviewer-agent MUST-FIX/SHOULD-FIX entries). When two or more independent reviewers flag the same location, severity is auto-promoted to **must-fix** regardless of original category. Surfaces convergence count in the audit summary.
- **Step 7 — Iteration-N Regression Check.** Snapshots `iterationStartSha` at Step 1, then after fixes are pushed re-fetches comments and runs `prReview(action: "regression-check", before, after, fromSha, toSha)`. New findings introduced by fix commits block iteration completion and re-enter Step 3 (Plan Fixes) with the regressions as input. Cycle is bounded: 3 consecutive failed iterations escalate to the user. Catches fix-induced regressions that would otherwise only surface in the next review pass.
- Old "Step 7 — Store Learnings" renumbered to Step 8.

**Caveman skill** (`.mastracode/skills/caveman/SKILL.md`): single-word grammar fix in the destructive-op resume example to match caveman speech pattern (`exists` → `exist`).
