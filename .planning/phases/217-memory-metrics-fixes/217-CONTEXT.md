# Phase 217 Context — Memory & Metrics Fixes

## Decisions

### S-06: Metrics + Observations endpoints

- **Fix:** Fetch engrams without tag filter, then filter client-side by `concept.startsWith("metric:")` and `concept.startsWith("session:observation")`
- **Files:** `app/api/muninn/metrics/route.ts`, `app/api/muninn/observations/route.ts`

### S-07: Zone history timeline

- **Fix:** The `.planning/.context-metrics.json` is a single snapshot (always 1 entry). Create a zone history accumulator that appends to a JSONL log on each zone transition, then read the log for the timeline.
- **Alternative (simpler):** Read MuninnDB engrams with concept prefix `session:context-zone` to reconstruct zone history from existing MuninnDB data.
- **Selected:** Use MuninnDB recall as the data source — no new file format needed. The zone-history route should query MuninnDB for `session:context-zone` or `metric:context-zone` engrams.
- **File:** `app/api/muninn/zone-history/route.ts`

---

_Context created: 2026-03-27 — Phase 217 (SIMPLE complexity)_
