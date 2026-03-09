---
title: Remove SpacetimeDB from framework
area: infrastructure
created: 2026-03-08
source: conversation
---

## Context

Decided to migrate luca-observer from SpacetimeDB to MuninnDB. The framework's SpacetimeDB integration must be removed as the first step.

## Task

Remove all SpacetimeDB-specific code from luca-framework:

- Delete `src/state/__helpers/spacetimedb-client.ts` (SQL query client)
- Delete `src/state/__helpers/observer-emitter.ts` (reducer caller)
- Delete `src/state/__helpers/stdb-config.ts` (SpacetimeDB config)
- Remove `emit-event` and `emit-context-snapshot` subcommands from `src/state/bridge.ts`
- Remove SpacetimeDB reducer calls from `src/state/persistence.ts` (keep local JSON dual-write)
- Remove SpacetimeDB calls from `src/state/ledger.ts`
- Clean up `src/state/__helpers/audit-findings.ts` SpacetimeDB references
- Update hook scripts that emit to SpacetimeDB: `session-start.sh`, `session-persist.sh`, `context-check-throttled.sh`
- Remove env vars: `LUCA_SPACETIMEDB_URL`, `LUCA_SPACETIMEDB_DB`

## Notes

- Keep local JSON/JSONL fallback writes (state.json, session-ledger.jsonl) — these become primary until MuninnDB emission replaces them
- The bridge's read commands (read-status, read-complexity, etc.) are unaffected — they read from local state
- Brainstorm doc: `.claude/plans/polished-mapping-fern.md`
