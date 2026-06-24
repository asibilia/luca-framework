---
title: "P2: Implement TTL cleanup for high-volume SpacetimeDB tables"
area: data
created: 2026-03-04
source: repo-review audit (db-reviewer)
priority: P2
---

## Context

High-volume observability tables are append-only with no cleanup mechanism. Estimated ~500-1000 events per major workflow, growing indefinitely.

## Task

1. Add scheduled cleanup reducer to SpacetimeDB module
2. Implement retention policies:
   - observer_events: 30-day retention
   - tool_calls: 30-day retention
   - token_usage: 60-day retention
   - context_snapshots: 7-day retention
   - decision_logs: 90-day retention
3. Add index on `timestamp` for observer_events (currently only indexed on sessionId)
4. Add composite index (sessionId + timestamp) for common query patterns

## Notes

- Also missing indexes on eventType for filtering
- No data export mechanism exists — consider adding before implementing TTL
- Sequence numbers should ideally be managed server-side, not client cache
