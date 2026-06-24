---
phase: 143
plan: 2
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 143 Plan 2: DRY Consolidation in consensus-resolver.ts

## Objective

Eliminate two DRY violations in `consensus-resolver.ts`: merge the structurally identical `buildHighestConfidenceResult`/`buildFallbackResult` functions into a single builder, and extract a type-safe `isExpertPerspective()` helper to replace 3 duplicated unsafe expert-check patterns.

> Audit refs: HIGH #5, HIGH #6

## Context

@src/shared/\_\_helpers/consensus-resolver.ts

**DRY violation #1 (HIGH #5):** `buildHighestConfidenceResult` (lines 317-355) and `buildFallbackResult` (lines 357-397) are structurally identical. Both sort perspectives by confidence descending, pick the winner, split into voters/dissenters, and return the same ConsensusResult shape. The only difference is the JSDoc comment. They should be merged into a single function.

**DRY violation #2 (HIGH #6):** The expert perspective check pattern appears 3 times with an unsafe `as Record<string, unknown>` cast:

- `countExpertParticipants` lines 180-183:
  ```typescript
  "agent" in perspective &&
    expertSet.has((perspective as Record<string, unknown>).agent as string);
  ```
- `countVotes` lines 207-209:
  ```typescript
  "agent" in perspective &&
    expertSet.has((perspective as Record<string, unknown>).agent as string);
  ```
- `buildDeferToExpertResult` lines 466-468:
  ```typescript
  "agent" in p && expertSet.has((p as Record<string, unknown>).agent as string);
  ```

These should be extracted into a single type-safe helper.

## Tasks

### 1. Extract isExpertPerspective helper and merge duplicate builders

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/shared/__helpers/consensus-resolver.ts`:

**Step A — Extract `isExpertPerspective()` helper:**

Add a new internal helper function (in the internal helpers section, around line 164):

```typescript
/**
 * Type-safe check for whether a perspective comes from an expert agent.
 *
 * Replaces the repeated pattern of:
 *   "agent" in p && expertSet.has((p as Record<string, unknown>).agent as string)
 *
 * @param perspective - A votable perspective that may have an `agent` field
 * @param expertSet - Set of expert agent names from config
 * @returns True if the perspective has an `agent` field matching an expert name
 */
function isExpertPerspective<TCategory extends string>(
  perspective: VotablePerspective<TCategory>,
  expertSet: Set<string>,
): boolean {
  if (expertSet.size === 0) return false;
  return (
    "agent" in perspective &&
    typeof (perspective as Record<string, unknown>).agent === "string" &&
    expertSet.has((perspective as Record<string, unknown>).agent as string)
  );
}
```

Then replace the 3 duplicate patterns:

1. In `countExpertParticipants` (lines 180-183), replace the inline check with:

   ```typescript
   if (isExpertPerspective(perspective, expertSet)) {
     count++;
   }
   ```

2. In `countVotes` (lines 206-209), replace:

   ```typescript
   const isExpert = isExpertMode && isExpertPerspective(perspective, expertSet);
   ```

3. In `buildDeferToExpertResult` (lines 464-468), replace the filter predicate:
   ```typescript
   const expertPerspectives = filter(perspectives, (p) =>
     isExpertPerspective(p, expertSet),
   );
   ```

**Step B — Merge `buildHighestConfidenceResult` and `buildFallbackResult` into one function:**

Replace both functions (lines 317-397) with a single function:

```typescript
/**
 * Build a consensus result by picking the highest-confidence perspective.
 *
 * Used as the fallback resolution for highest_confidence, halt, escalate,
 * and escalate_to_human strategies. The caller distinguishes strategy
 * semantics via the `fallback_strategy_applied` field.
 */
function buildHighestConfidencePickResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  perspectives: TPerspective[],
  config: ConsensusConfig,
  expertVoteCount: number,
  strategy: ConsensusConfig["fallback_strategy"],
): ConsensusResult<TCategory, TPerspective> {
  const sorted = orderBy([...perspectives], (p) => p.confidence, "desc");
  const winner = sorted[0];

  if (!winner) {
    return buildEmptyResult(config, expertVoteCount, strategy);
  }

  const category = winner.category_assessment;
  const voters = filter(
    perspectives,
    (p) => p.category_assessment === category,
  );
  const dissenters = filter(
    perspectives,
    (p) => p.category_assessment !== category,
  );

  return {
    consensus_category: category,
    consensus_voters: voters,
    dissenters,
    consensus_confidence: roundTo2(averageConfidence(voters)),
    mode_used: config.mode,
    fallback_applied: true,
    votes_for: voters.length,
    votes_against: dissenters.length,
    expert_votes: expertVoteCount,
    fallback_strategy_applied: strategy,
  };
}
```

Then update `applyFallback` (lines 266-315) to call `buildHighestConfidencePickResult` in all places that previously called either `buildHighestConfidenceResult` or `buildFallbackResult`:

- Lines 280-285 (`halt`/`escalate`/`escalate_to_human`): call `buildHighestConfidencePickResult`
- Lines 307-313 (`highest_confidence` / default): call `buildHighestConfidencePickResult`

**Files to create/edit:**

- `src/shared/__helpers/consensus-resolver.ts`

**Verification:**

- No duplicate builder functions remain
- Expert check pattern appears exactly once (in `isExpertPerspective`)
- All callers of the old functions now use the consolidated versions
- `bunx --bun tsc --noEmit` passes
- The `applyFallback` switch still routes to the correct builder for each strategy

## Verification

1. TypeScript compilation: `bunx --bun tsc --noEmit` passes
2. `buildHighestConfidenceResult` and `buildFallbackResult` no longer exist as separate functions
3. A single `buildHighestConfidencePickResult` replaces both
4. `isExpertPerspective()` exists as a standalone helper
5. The pattern `"agent" in perspective && expertSet.has(...)` appears only inside `isExpertPerspective`
6. `applyFallback` correctly delegates to the merged builder for halt/escalate/escalate_to_human/highest_confidence strategies

## Success Criteria

- Net reduction in lines of code (removing ~40 lines of duplication)
- Zero change in external behavior (ConsensusResult shape and semantics unchanged)
- All expert-check logic centralized in one function
- Type safety improved (typeof check added to isExpertPerspective)

## Output Specification

- Modified: `src/shared/__helpers/consensus-resolver.ts`
  - New: `isExpertPerspective()` helper
  - New: `buildHighestConfidencePickResult()` (merged builder)
  - Removed: `buildHighestConfidenceResult()`, `buildFallbackResult()` (replaced by merged builder)
  - Modified: `countExpertParticipants()`, `countVotes()`, `buildDeferToExpertResult()`, `applyFallback()` (use new helpers)
