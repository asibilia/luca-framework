# milestone-prune

Detect and prune stale MuninnDB engrams for the milestone-complete sub-skill chain.

## main

<main>
# milestone-prune — Stale Memory Detection and Pruning

Analyze memory health and prune stale engrams before milestone archival.

## Context File Protocol

This sub-skill is part of the milestone-complete chain. It reads/writes the shared context file at `/tmp/milestone-complete-context.json`.

**Read:** Call `readMilestoneCompleteContext()` from `src/skills/__schemas/milestone-complete-context.schemas.ts`. If `success: false`, ABORT immediately.

**Write:** Call `writeMilestoneCompleteContext({ milestone_prune: { ... } })` to populate the `milestone_prune` section.

## Vault Resolution

```bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
```

## Process

### Step 1: Recall Engrams and Metrics

Split into two focused recalls to ensure accurate data:

**1a. Recent phase metrics** (rolling window of last 10 phases):

```
mcp__muninn__muninn_recall(
  vault: REPO_VAULT,
  context: "metric:memory-recall-precision metric:memory-hit-rate",
  mode: "recent",
  limit: 10
)
```

**1b. Pattern/decision/pitfall engrams** (for cross-referencing feedback):

```
mcp__muninn__muninn_recall(
  vault: REPO_VAULT,
  context: "pattern: decision: pitfall:",
  mode: "deep",
  limit: 100
)
```

### Step 2: Identify Stale Engrams

An engram is "stale" when BOTH conditions are met:

1. 5+ recalls with 0 positive feedback (useful=true) across the rolling window
2. 3+ milestones with no positive feedback

Steps to compute:
a. Recall last 10 phase metric engrams from MuninnDB
b. For each pattern/decision/pitfall engram that appeared in recalls:
   - Count total recalls across phases
   - Count positive feedback instances (useful=true)
   - Group by milestone, count milestones with 0 positive feedback
c. Flag engrams meeting BOTH thresholds

### Step 3: Human Review Checkpoint

If no stale engrams detected, display: "No stale engrams detected. Memory is healthy." and skip to Step 5 (consolidation).

If stale engrams found, display them to the developer for review:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 <%= branding.frameworkName %> > STALE ENGRAM REVIEW — v{version}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{count} stale engrams detected (5+ recalls, 0 positive, 3+ milestones dormant):

| #   | Concept                  | Recalls | Positive | Milestones Dormant |
| --- | ------------------------ | ------- | -------- | ------------------ |
| 1   | pitfall:old-issue        | 7       | 0        | 4                  |
| 2   | pattern:deprecated-flow  | 5       | 0        | 3                  |

[Y] Prune all  [N] Keep all  [S] Select individually
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Handle each response:

- **Y (Prune all):** Delete all listed engrams via `muninn_forget` (see Step 4)
- **N (Keep all):** Skip deletion, proceed to Step 5 (consolidation)
- **S (Select individually):** Present each engram and ask Y/N per engram, then delete approved ones

### Step 4: Prune After Approval

For each engram approved for deletion:

```
mcp__muninn__muninn_forget(vault: REPO_VAULT, id: "{engram_id}")
```

Note: `muninn_forget` performs a soft-delete with a 7-day recovery window.

### Step 5: Consolidate Near-Duplicates

Run `muninn_consolidate` at every milestone boundary, regardless of whether stale engrams were found:

```
mcp__muninn__muninn_consolidate(vault: REPO_VAULT)
```

### Step 6: Store Pruning Report and Write Context

Store pruning report as a milestone metric:

```
mcp__muninn__muninn_remember(
  vault: REPO_VAULT,
  concept: "metric:memory-pruning-{milestone_version}",
  content: JSON.stringify({
    stale_detected: {count},
    human_approved_for_deletion: {count},
    forgotten: {count},
    consolidated: {count from muninn_consolidate result},
    total_engrams_analyzed: {count},
    stale_threshold: "5+ recalls, 0 positive, 3+ milestones dormant",
    pruned_at: new Date().toISOString()
  })
)
```

Write results to context file:

```typescript
import { writeMilestoneCompleteContext } from "src/skills/__schemas/milestone-complete-context.schemas";

await writeMilestoneCompleteContext({
  milestone_prune: {
    stale_memories_found: staleCount,
    pruned_count: prunedCount,
    consolidated_count: consolidatedCount,
    total_analyzed: totalAnalyzed,
  },
});
```

## Output

On success, the context file `milestone_prune` section will contain:

```json
{
  "stale_memories_found": 2,
  "pruned_count": 2,
  "consolidated_count": 1,
  "total_analyzed": 45
}
```

## Error Handling

- **MuninnDB recall failure:** Log warning, set all counts to 0, write to context, and return.
- **User declines all pruning:** Set `pruned_count: 0`, proceed to consolidation.
- **Context file read failure:** ABORT immediately.

## Constraints

- This is an interactive sub-skill (requires user input for prune decisions)
- Always run consolidation regardless of pruning outcome
- Use REPO_VAULT for all MuninnDB operations in this sub-skill
</main>