---
title: "Fix observer memory page data gaps"
area: observer
created: 2026-03-14
source: conversation
---

## Context

The `/memory` page in luca-observer has three sections showing empty state despite an active Claude Code session with valid data being written by hooks.

## Task

Fix three root causes preventing data from displaying on the memory page:

### 1. Path resolution bug (affects 2 routes)

**Routes:** `/api/muninn/checkpoint`, `/api/muninn/zone-history`
**Problem:** Both use bare `process.cwd()` to locate `.planning/` files. The Next.js process runs from `packages/luca-observer/`, not the project root, so the files are never found.
**Fix:** Apply the `findProjectRoot()` pattern already used by the working `/api/context-metrics` route.
**Files:**

- `packages/luca-observer/app/api/muninn/checkpoint/route.ts:27-31`
- `packages/luca-observer/app/api/muninn/zone-history/route.ts:24-28`
- `packages/luca-observer/app/api/context-metrics/route.ts:54-67` (reference implementation)

### 2. Checkpoint route reads wrong file

**Route:** `/api/muninn/checkpoint`
**Problem:** Reads `.context-checkpoint.json` which only exists after a context compaction event. The session status hero should show live session data from `.context-metrics.json` (written every ~60s by statusline hook), not just post-compaction snapshots.
**Fix:** Change the checkpoint route to read `.context-metrics.json` (or create a new route that does), so active session status displays continuously.
**Evidence:** `.context-metrics.json` has `zone`, `usage_percent`, `checked_at` — exactly what the session status hero needs.

### 3. No writers for observation/metric MuninnDB engrams

**Routes:** `/api/muninn/observations`, `/api/muninn/metrics`
**Problem:** The recall effectiveness section expects MuninnDB engrams with `session:observation*` and `metric:*` concept prefixes. No hook or process currently writes these engrams during normal operation.
**Impact:** "No Recall Metrics" empty state. This is a feature gap, not a bug.
**Fix:** Either wire in observation/metric writers to existing hooks, or redesign the recall effectiveness section to use data that IS being captured.

## Notes

- The header bar's context window indicator works fine because `/api/context-metrics` already solved the path resolution problem
- Issues #1 and #2 are quick fixes; issue #3 requires a design decision
- Discovered via browser inspection of http://localhost:3456/memory with playwright-cli
