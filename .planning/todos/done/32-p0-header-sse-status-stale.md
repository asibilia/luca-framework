---
title: "P0: Fix header — shows 'SSE Connected' with hardcoded green dot"
area: ui
created: 2026-03-04
source: repo-review audit (uiux-reviewer)
priority: P0
---

## Context

The observer dashboard header still displays "SSE Connected" with an always-green status dot, but the entire SSE infrastructure was removed during SpacetimeDB migration. Users cannot determine actual connection state.

## Task

1. Update `packages/luca-observer/components/layout/header.tsx:42`
2. Change label from "SSE Connected" to "SpacetimeDB" or "Real-time"
3. Bind status dot color to actual SpacetimeDB `DbConnection` state:
   - Green: connected and subscribed
   - Yellow: connecting/reconnecting
   - Red: disconnected
4. Show error tooltip on hover when disconnected

## Notes

- `onConnect()` and `onDisconnect()` callbacks exist in SpacetimeDB client
- Current code is hardcoded — green dot always shows regardless of connection
- Related: CRIT-6 — agents page also references "via SSE" in empty state text
