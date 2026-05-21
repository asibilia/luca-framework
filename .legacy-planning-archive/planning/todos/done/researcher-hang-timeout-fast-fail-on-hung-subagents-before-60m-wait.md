---
title: "Researcher hang-timeout — fast-fail on hung subagents before 60m wait (currently orchestrator waits full harness timeout)"
area: orchestrator
created: 2026-05-15
priority: medium
source: run-mp706uzq-analysis
muninn_id: 01KRP99A1FB3CVR3Y37RN02AQ9
---

## Task

Investigate and fix the orchestrator-side detection latency for hung research subagents. Currently, the parent waits the full harness kill timeout (~60m) before retrying — should fast-fail within 5m for researchers.

---
confidence: high
externalResearch: false
priority: 2
---

## Problem

In `run_mp706uzq_udb346w7` (5/15), researcher-scope + researcher-risk were stuck on the Convex MCP server (malformed request → AbortError every retry). Telemetry shows:

- invoke at `14:21:36`
- complete (killed) at `15:23:24`
- **wait: 61m 47s**

Architect retried both successfully on sonnet-4-5 in 1m 52s after the kill landed. The retry path works fine — the issue is detection latency.

Same pattern in 3 consecutive COMPLEX runs:
- `run_mp4auyvh_13axajuq` (5/13) — 0 killed (lucky)
- `run_mp5jq8br_o2oafvs8` (5/14) — 3 killed
- `run_mp706uzq_udb346w7` (5/15) — 2 killed

## Why this matters

A hung researcher adds **~60m** to a run. For a 2-hour pipeline, that's 50% wall time wasted on detection. Even partially fixing this is a major win.

## Investigation steps

1. Check Mastra harness docs / source — does `HarnessSubagent` config expose `timeoutMs` per spawn?
2. If yes: set researchers to 5m, executors to 15m, reviewers to 8m (typical p95 + buffer)
3. If no: add orchestrator-side watchdog
   - After `record-subagent invoke`, schedule a check in N minutes
   - If no matching `complete` event by then, emit synthetic `complete` with `outcome:"killed-watchdog"` and proceed to retry
4. Document harness behavior either way in `docs/troubleshooting.md`

## Acceptance criteria

1. Hung researcher detected within 5m, not 60m+
2. Retry path triggers automatically (preserve existing fallback to sonnet)
3. Telemetry shows shortened invoke→complete gap on killed researchers
4. New outcome value `killed-watchdog` (if approach 3) distinct from harness-`killed`
5. No regression on legitimate long-running researchers — verify p95 research duration < new timeout

## Related

- Existing todo: `record-subagent-failure-mode-disambiguation` (5-value outcome enum) — coordinate with that work
- Related to Convex MCP recall pattern (other new todo) — fixing recall reduces hang frequency but doesn't eliminate; both fixes are complementary

## Out of scope

- Per-subagent dynamic timeouts (just pick fixed per-role budgets)
- Harness-side fix (file separate upstream issue if needed)
