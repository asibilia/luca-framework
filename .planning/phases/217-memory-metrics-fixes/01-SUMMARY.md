---
phase: 217
plan: 1
status: complete
---

# Summary — Phase 217, Wave 1: Memory & Metrics Fixes

## Objective

Fix three MuninnDB proxy endpoints that returned empty results because they relied on MuninnDB's `tags` parameter for concept prefix filtering. MuninnDB tags do exact matching, not prefix matching, so the tag-based approach never matched any engrams. Additionally, the zone-history endpoint read a single-snapshot local file instead of querying MuninnDB for historical data.

## Tasks Completed

### Task 1: Fix metrics endpoint (a77027c6)

**File:** `packages/luca-studio/app/api/muninn/metrics/route.ts`

- Removed `"metric:"` tag parameter from `listEngrams` call
- Added client-side filtering: `concept.startsWith("metric:")`
- Uses `lodash/filter` for consistency with codebase conventions
- Fetches 5x the requested limit to account for post-filter reduction

### Task 2: Fix observations endpoint (4b30d03d)

**File:** `packages/luca-studio/app/api/muninn/observations/route.ts`

- Removed `"session:observation"` tag parameter from `listEngrams` call
- Added client-side filtering: `concept.startsWith("session:observation")`
- Same pattern as metrics endpoint fix

### Task 3: Fix zone-history endpoint (6ebf6050)

**Files:**

- `packages/luca-studio/app/api/muninn/zone-history/route.ts` (full rewrite)
- `packages/luca-studio/lib/muninn-schemas.ts` (updated ZoneHistoryQuerySchema)

- Replaced file-based `.planning/.context-metrics.json` read with MuninnDB query
- Filters by concept prefix `session:context-zone` or `metric:context-zone`
- Added `parseZoneContent()` to extract zone/usage/timestamp from engram content (supports JSON and structured text formats)
- Updated `ZoneHistoryQuerySchema` to accept `vault` and `limit` query parameters
- Removed `node:fs`, `node:path`, and `next/server` direct imports in favor of `muninnProxyHandler` pattern
- Sorts entries chronologically (ascending) for timeline display

## Deviations

None.

## Verification

- `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json` — 3 pre-existing errors (none related to these changes):
  - `harness-tab.tsx(87)` — type mismatch in HarnessCheck
  - `raw-config-editor.tsx(142)` — missing argument
  - `file-watcher.ts(52)` — missing chokidar namespace

## Pattern Applied

All three endpoints now follow the same pattern:

1. Fetch engrams from MuninnDB without tag filter (wider fetch limit)
2. Filter client-side using `concept.startsWith(prefix)`
3. Slice to requested limit
4. Return in existing response schema shape
