# Phase 274: Memory Page Fixes (S-06, S-07)

**Goal:** Fix Memory page — populate recall metrics and show full timeline history.
**Complexity:** SIMPLE
**Wave:** 1

## Root Cause Analysis

**S-06 (Recall metrics empty):**
The `useObservations` hook looks for `metric:recall-hit-rate` and `metric:recall-precision` engrams in MuninnDB, but these engrams are never written by any code. The context-check hook writes `session:observation-*` engrams containing zone/usage data, but nothing computes and stores recall metrics.

Fix: Derive metrics from observation engrams. The observations contain zone transition data. We can compute:

- **Observation frequency** as a proxy for recall activity (observations per session)
- **Zone distribution** from the observation zones (peak/good/degrading/stop percentages)

Alternatively, the simplest fix is to make the RecallEffectiveness component also display observation-based stats when no formal metrics exist.

**S-07 (Timeline shows only 1 event):**
The zone-history API queries for `session:context-zone` / `metric:context-zone` concept prefixes, but no code ever writes engrams with these concepts. Zone data is instead embedded in `session:observation-*` engrams written by the context-check hook. So `zone_history` in the checkpoint data is always empty or has at most 1 entry.

Fix: Update the zone-history API route to query `session:observation` prefix (where the data actually lives) and extract zone/usage data from those engrams.

## Tasks

### Task 1: fix-zone-history-source — Fix zone-history API to read from observation engrams

**File:** `packages/luca-studio/app/api/muninn/zone-history/route.ts`
**file_count_estimate:** 1
**scope:** single-component

Change `filterByConceptPrefix` call from `["session:context-zone", "metric:context-zone"]` to `["session:observation"]`. The observation engrams contain zone and usage_percent in their content. The existing `parseZoneContent()` function can parse this from the engram content (it handles both JSON and text patterns). The observations are already sorted by created_at.

### Task 2: fix-recall-metrics — Derive recall metrics from observation data

**File:** `packages/luca-studio/hooks/use-observations.ts`
**file_count_estimate:** 1
**scope:** single-component

When `metric:recall-*` engrams don't exist, derive metrics from observation engrams instead:

1. Compute hit_rate from observation zone distribution: observations in "peak"/"good" zones / total observations
2. Compute precision from observation consistency: if most observations are in the same zone, precision is high
3. Fall back to null when no observations exist at all

This gives the RecallEffectiveness component useful data even without formal metric engrams.

## Success Criteria

- [ ] Memory timeline shows multiple zone transition events from observation engrams
- [ ] Recall metrics section shows derived values when observations exist
- [ ] Both sections gracefully show empty state when no data exists at all
- [ ] `bunx --bun tsc --noEmit` passes
