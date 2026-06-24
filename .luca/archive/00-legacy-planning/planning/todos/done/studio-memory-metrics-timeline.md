---
title: "P2: Fix memory browse metrics + timeline single event (S-06/S-07)"
area: api
created: 2026-03-27
source: docs/review/studio/03-memory.md
priority: P2
estimated_size: M
---

## Context

Memory Browse shows no recall metrics, and Memory Timeline only shows 1 event. Both stem from MuninnDB tag prefix filtering not working as expected — the API passes tag prefixes expecting prefix matching but gets exact matching.

## Task

1. **S-06: Fix metrics endpoint** — `app/api/muninn/metrics/route.ts`
   - Fetch engrams without tag filter, then filter client-side by `concept.startsWith("metric:")`

2. **S-06 related: Fix observations endpoint** — `app/api/muninn/observations/route.ts`
   - Same pattern: client-side `concept.startsWith("session:observation")` filter

3. **S-07: Fix zone-history single snapshot** — `app/api/muninn/zone-history/route.ts`
   - Currently reads `.planning/.context-metrics.json` which is a single snapshot (always 1 entry)
   - Options: create proper zone history log file, or accumulate transitions client-side

## Notes

- S-06 and the observations fix share the same pattern — unified fix approach
- S-07 requires a design decision about where to store historical zone data
- The `listEngrams()` client in `lib/muninn-config.ts:227-232` passes tags as query param
- See review: `docs/review/studio/03-memory.md`
