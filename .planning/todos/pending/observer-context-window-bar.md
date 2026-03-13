---
title: Add context window usage bar to observer header with file-based metrics pipeline
area: observer
created: 2026-03-13
source: conversation
priority: medium
complexity: MODERATE
---

## Context

The observer's existing `ContextUsageBar` shows MuninnDB vault statistics (engram count, coherence, storage), NOT context window usage. There is no visualization of real-time context consumption, zone transitions, or checkpoint events. This todo adds an always-visible header bar showing context window state.

This is Decision 4 from `docs/memory-system/decisions.md`.

## Why

Context window usage is the master constraint for AI coding sessions. Without visibility, the user doesn't know when quality is degrading or when compaction is imminent. An always-visible bar in the header gives ambient awareness across all observer pages.

## Task

### Part 1: Metrics Writer (Hook Enhancement)

Update `src/hooks/scripts/context-check-throttled.sh`:

1. In addition to existing warning behavior, write context metrics to `.planning/.context-metrics.json`
2. Metrics schema:
   ```json
   {
     "timestamp": "2026-03-13T18:00:00Z",
     "transcript_bytes": 150000,
     "zone": "good",
     "usage_percent": 35,
     "tool_call_count": 42,
     "session_start": "2026-03-13T17:30:00Z",
     "checkpoints": [
       { "timestamp": "2026-03-13T17:45:00Z", "trigger": "proactive" }
     ]
   }
   ```
3. Write on every throttled check (60s interval — already exists)
4. Include checkpoint log entries when proactive checkpoints fire

### Part 2: API Route

Create `packages/luca-observer/app/api/context-metrics/route.ts`:

1. Read `.planning/.context-metrics.json` via `Bun.file().json()`
2. Return JSON response with appropriate cache headers (`Cache-Control: no-cache`)
3. Return 503 if file doesn't exist (session not active)
4. Stateless per-request read — no file watching

### Part 3: Context Window Bar Component

Create `packages/luca-observer/components/memory/context-window-bar.tsx`:

1. Compact horizontal bar for header placement
2. Progress bar with zone-based coloring:
   - Peak (0-30%): green
   - Good (30-50%): blue
   - Degrading (50-70%): amber
   - Stop (70%+): red
3. Show: usage percentage + zone badge
4. Hover tooltip with expanded metrics: session duration, tool call count, checkpoint count, last checkpoint time
5. Click navigates to `/memory` page for deep-dive
6. Poll via SWR with `refreshInterval: 10000` (10s default)
7. `refreshWhenHidden: false` to pause when tab not visible
8. Adaptive polling: 5s active, 10s default, 30s idle, manual after 3 failures

### Part 4: Header Integration

Update `packages/luca-observer/app/layout.tsx` (or header component):

1. Add `ContextWindowBar` to header between flex spacer and vault switcher
2. Layout: `[Sidebar Trigger] | [Separator] | [Flex spacer] | [Context Bar] | [Vault] | [Theme]`
3. Graceful degradation: hide bar if no metrics file available (session not active)

## Acceptance Criteria

- Context metrics JSON written by hook every 60s during active sessions
- API route serves metrics from file
- Header bar shows context usage percentage with zone coloring
- Tooltip shows session duration, tool calls, checkpoints
- Polling at 10s with intelligent backoff
- Bar is always visible across all observer pages
- Bar hidden gracefully when no active session
- Existing `ContextUsageBar` on `/memory` page unchanged (it shows vault stats, different purpose)

## Dependencies

- None — this can be implemented independently of the checkpoint hooks
- Enhanced by `precompact-checkpoint-hook` (checkpoint events appear in metrics)

## References

- `docs/memory-system/decisions.md` — Decision 4: Observer Memory Bar
- `packages/luca-observer/components/memory/context-usage-bar.tsx` — existing vault stats bar (styling reference)
- `packages/luca-observer/hooks/use-memory.ts` — polling + error pattern to follow
- `packages/luca-observer/app/layout.tsx` — header layout
- `src/hooks/scripts/context-check-throttled.sh` — hook to enhance
- [SWR API](https://swr.vercel.app/docs/api) — refreshInterval, refreshWhenHidden
- [VS Code Status Bar UX](https://code.visualstudio.com/api/ux-guidelines/status-bar) — compact indicator patterns

## Notes

Use Tremor's ProgressBar or a custom Tailwind progress bar for the visualization. The existing observer uses Tremor (`@tremor/react`) which is already installed. SWR is recommended for polling but the observer currently uses manual fetch — consider migrating `useMemory` hook to SWR in the same effort or keeping the pattern consistent.
