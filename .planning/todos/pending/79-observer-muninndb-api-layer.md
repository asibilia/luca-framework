---
title: Build observer MuninnDB API layer
area: api
created: 2026-03-08
source: conversation
---

## Context

The observer needs API routes that proxy to MuninnDB for all 8 planned views. 4 routes already exist and need to be expanded.

## Task

Expand `/api/muninn/` routes to cover all view data needs:

- `/api/muninn/engrams` (exists) — enhance with type/tag/entity filtering
- `/api/muninn/activate` (exists) — semantic recall with mode/profile params
- `/api/muninn/stats` (exists) — vault health stats
- `/api/muninn/session` (exists) — session activity
- `/api/muninn/entity` (new) — entity aggregate view
- `/api/muninn/entity-timeline` (new) — entity chronological evolution
- `/api/muninn/entity-clusters` (new) — co-occurrence pairs
- `/api/muninn/graph` (new) — export_graph for visualization
- `/api/muninn/traverse` (new) — BFS graph traversal
- `/api/muninn/contradictions` (new) — conflict detection
- `/api/muninn/explain` (new) — recall score breakdown

## Notes

- On-demand queries + manual refresh (no WebSocket push)
- Existing routes at `packages/luca-observer/app/api/muninn/`
- MuninnDB config at `packages/luca-observer/lib/muninn-config.ts`
