# S-06, S-07 — Memory Page Issues

## S-06: Memory > Browse — Recall Metrics Always Empty (Medium)

### Symptom

The Memory Browse page displays engram entries but the Recall Effectiveness panel (hit rate, precision) is permanently empty.

### Root Cause

**MuninnDB tag prefix filtering doesn't work as expected.** The metrics API passes a tag prefix to MuninnDB, but the API performs exact tag matching, not prefix matching.

**File:** `packages/luca-studio/app/api/muninn/metrics/route.ts`

The endpoint calls:

```typescript
client.listEngrams(vault, limit, 0, "metric:");
```

**File:** `packages/luca-studio/lib/muninn-config.ts:227-232`

```typescript
async listEngrams(vault, limit = 100, offset = 0, tags?) {
  let url = `/api/engrams?vault=${encodeURIComponent(vault)}&limit=${limit}&offset=${offset}`;
  if (tags) url += `&tags=${encodeURIComponent(tags)}`;
  const res = await muninnFetch(url, undefined, vault);
  if (!res.ok) throw new Error(`MuninnDB engrams: ${res.status}`);
  return res.json();
}
```

The `tags=metric:` parameter is passed to MuninnDB's `/api/engrams` endpoint. If MuninnDB matches tags exactly (not as prefixes), no engrams match the bare `"metric:"` string — actual engrams have concepts like `"metric:recall-hit-rate"` or `"metric:recall-precision"`.

### Data Flow

1. `RecallEffectiveness` component receives `ObservationsData` with `metrics: []` (empty)
2. `extractMetricValue()` searches empty array, returns `null`
3. Both `hit_rate` and `precision` are `null`
4. Component renders EmptyState instead of metric gauges

**File:** `packages/luca-studio/components/memory/recall-effectiveness.tsx:17-27`

### Fix

Fetch all engrams without tag filter, then filter client-side by concept prefix:

```typescript
// In /api/muninn/metrics/route.ts
const data = await client.listEngrams(vault, limit, 0); // no tag filter
const metrics = (data.engrams ?? []).filter((engram) =>
  engram.concept?.toLowerCase().startsWith("metric:"),
);
return { metrics, total: metrics.length };
```

### Also Affects

The observations endpoint (`/api/muninn/observations/route.ts`) likely has the same prefix-matching issue with `"session:observation"` tag filter. Apply the same client-side filtering fix.

---

## S-07: Memory > Timeline — Only 1 Event (Medium)

### Symptom

The Memory Timeline visualization renders but only shows 1 event, regardless of how many memory operations have occurred.

### Root Cause

**Two compounding issues:**

#### Issue 1: Zone history is a single snapshot, not a log

**File:** `packages/luca-studio/app/api/muninn/zone-history/route.ts:46,87-89`

The zone-history endpoint reads from `.planning/.context-metrics.json`, which is a **single snapshot file** that gets overwritten on each context check. It always returns exactly 1 entry:

```typescript
const response = {
  entries: [entry], // Always a single-element array
  total: 1,
};
```

This is by design — `.context-metrics.json` is a current-state file, not a historical log. The timeline needs historical data that doesn't currently exist.

#### Issue 2: Observations may also be empty (same tag filter bug as S-06)

**File:** `packages/luca-studio/hooks/use-observations.ts:111`

The observations hook fetches:

```
/api/muninn/observations?vault=${v}&limit=50
```

If this endpoint uses the same tag-prefix filtering that fails for metrics (S-06), observations would also return empty, leaving only the 1 zone-history entry on the timeline.

### Data Flow

**File:** `packages/luca-studio/components/memory/memory-timeline.tsx`

The `buildTimeline()` function merges:

1. **Zone history entries** — always exactly 1 (from single snapshot)
2. **Observation entries** — potentially 0 (if tag filter fails)

Result: timeline shows 1-2 events maximum.

### Fix

**Fix 1 (zone history):** Create a proper zone history log file (`.planning/.zone-history.json`) that appends entries instead of overwriting, or accumulate zone transitions client-side in a Jotai atom.

**Fix 2 (observations):** Apply the same client-side concept-prefix filtering fix as S-06:

```typescript
// In /api/muninn/observations/route.ts
const data = await client.listEngrams(vault, limit, 0);
const observations = (data.engrams ?? []).filter((engram) =>
  engram.concept?.toLowerCase().startsWith("session:observation"),
);
return { observations, total: observations.length };
```

---

## Shared Root Cause: MuninnDB Tag Filter Pattern

S-06 and S-07 (plus the observations component) all stem from the same pattern: **passing a tag prefix string to MuninnDB's `listEngrams()` expecting prefix matching, but getting exact matching instead.**

All MuninnDB proxy routes that use tag filtering should be audited:

| Route                      | Tag Filter                 | Affected |
| -------------------------- | -------------------------- | -------- |
| `/api/muninn/metrics`      | `"metric:"`                | S-06     |
| `/api/muninn/observations` | `"session:observation"`    | S-07     |
| `/api/muninn/engrams`      | `memory_type` field filter | S-04     |

**Unified fix pattern:** Fetch without tag filter, apply client-side `concept.startsWith()` filtering.

---

## Files Involved

| File                                                              | Issue                                      |
| ----------------------------------------------------------------- | ------------------------------------------ |
| `packages/luca-studio/app/api/muninn/metrics/route.ts`            | Tag prefix filter doesn't match            |
| `packages/luca-studio/app/api/muninn/observations/route.ts`       | Same tag prefix filter issue               |
| `packages/luca-studio/app/api/muninn/zone-history/route.ts`       | Returns single snapshot, not history       |
| `packages/luca-studio/lib/muninn-config.ts:227-232`               | `listEngrams()` passes tags as query param |
| `packages/luca-studio/components/memory/recall-effectiveness.tsx` | Renders empty when metrics are empty       |
| `packages/luca-studio/components/memory/memory-timeline.tsx`      | `buildTimeline()` merges two empty sources |
| `packages/luca-studio/hooks/use-observations.ts`                  | Fetches observations and metrics           |
