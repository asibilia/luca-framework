---
phase: 217
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Plan 01 — Fix MuninnDB Client-Side Concept Filtering

## Objective

Fix three MuninnDB proxy endpoints that fail to return data because they rely on MuninnDB's `tags` parameter for concept prefix filtering. MuninnDB tags do exact matching, not prefix matching, so `metric:` and `session:observation` filters return empty results. The fix is to fetch engrams without tag filters and apply client-side `concept.startsWith()` filtering.

## Context

- @packages/luca-studio/app/api/muninn/metrics/route.ts
- @packages/luca-studio/app/api/muninn/observations/route.ts
- @packages/luca-studio/app/api/muninn/zone-history/route.ts
- @packages/luca-studio/lib/muninn-config.ts
- @packages/luca-studio/lib/muninn-schemas.ts

## Tasks

### Task 1: Fix metrics endpoint — client-side concept prefix filtering

type="auto"

Change `metrics/route.ts` to fetch engrams without a tag filter (use `listEngrams(vault, limit, 0)` without the 4th `tags` argument), then filter the returned engrams client-side using `engram.concept.startsWith("metric:")`.

**Verification:**

- [ ] No `tags` parameter passed to `listEngrams`
- [ ] Client-side filter uses `concept.startsWith("metric:")`
- [ ] Response shape unchanged (metrics array + total count)

### Task 2: Fix observations endpoint — same pattern

type="auto"

Change `observations/route.ts` to fetch without tag filter, then filter client-side by `engram.concept.startsWith("session:observation")`.

**Verification:**

- [ ] No `tags` parameter passed to `listEngrams`
- [ ] Client-side filter uses `concept.startsWith("session:observation")`
- [ ] Response shape unchanged (observations array + total count)

### Task 3: Fix zone-history endpoint — use MuninnDB instead of single snapshot

type="auto"

Replace the file-based `.context-metrics.json` read with a MuninnDB query. Use `listEngrams` without tag filter, then filter client-side for engrams whose concept starts with `session:context-zone` or `metric:context-zone`. Transform the engram data into the existing zone history response format.

**Verification:**

- [ ] No longer reads `.planning/.context-metrics.json`
- [ ] Queries MuninnDB via `muninnProxyHandler`
- [ ] Filters by concept prefix `session:context-zone` or `metric:context-zone`
- [ ] Response shape unchanged (entries array + total count)
- [ ] Accepts vault query parameter

## Verification

- [ ] `bunx --bun tsc --noEmit -p packages/luca-studio/tsconfig.json` passes
- [ ] All three endpoints use client-side concept prefix filtering
- [ ] No regressions in response schemas

## Success Criteria

- Metrics endpoint returns engrams with `metric:` concept prefix
- Observations endpoint returns engrams with `session:observation` concept prefix
- Zone history endpoint returns historical zone transitions from MuninnDB
- TypeScript compilation passes
