---
title: "fix fabricated durationMs — agents writing round numbers (60000, 90000, 120000) instead of computing Date.now() - ts"
area: telemetry
created: 2026-05-16
priority: medium
source: telemetry-analysis
---

## Task

fix fabricated durationMs — agents writing round numbers (60000, 90000, 120000) instead of computing Date.now() - ts

## Problem

Run 2 `run_mp7dcrpm_ue0yzcb0` shows `durationMs` on `subagent.complete` records with suspiciously round values: `45000`, `35000`, `25000`, `60000`, `120000`, `90000`, `75000`, `90000`, `60000`. These are agent-fabricated estimates, not real measurements.

Compare Run 1 `run_mp77zzvl_6z0n3mb3` where `durationMs: null` was correctly emitted (agents not making it up).

## Root cause

`record-subagent` prose says `durationMs: Date.now() - ts` on the complete record. Some agents:
- Follow the directive correctly → real ms values
- Skip the computation and emit a "reasonable-looking" estimate → round numbers
- Skip and emit `null` → correct fallback

The schema accepts any non-negative number, so fabricated values are silently stored.

## Fix options

**Option A** (preferred): Don't accept `durationMs` from agents at all — compute orchestrator-side from `invoke`/`complete` pair matched by `correlationId`. This is existing todo #11 — bumping priority because we now have concrete evidence of fabrication.

**Option B** (interim): Reject `durationMs` values that are exact multiples of 5000 unless `>= 300000` (5-min) — a heuristic flagging fabricated rounds. Brittle.

**Option C**: Stricter prose with `// MUST be Date.now() - ts, NOT a guess` and an example showing realistic non-round values.

## Acceptance criteria

1. Promote todo #11 (orchestrator-side compute) from medium to high.
2. Until #11 ships: add prose warning + add test asserting durationMs examples are non-round (`% 1000 !== 0` in inline examples).
3. Add aggregator skill flag: percentage of `durationMs` values divisible by 5000 (suspicion metric).

## Related

Closes the loop with todo #11. May be redundant once #11 ships — file as a backstop.
