---
title: Delete luca-spacetime package
area: infrastructure
created: 2026-03-08
source: conversation
---

## Context

SpacetimeDB is being fully replaced by MuninnDB. The server-side SpacetimeDB module is no longer needed.

## Task

- Delete `packages/luca-spacetime/` directory entirely (SpacetimeDB server module, schema, reducers, config)
- Remove from workspace configuration in root `package.json` if referenced
- Remove `spacetimedb` dependency from `bun.lock`
- Clean up any workspace-level scripts that reference luca-spacetime

## Notes

- This package contained the SpacetimeDB schema (18 tables, 30 reducers), cleanup schedules, and server-side logic
- The observer's `module_bindings/` were auto-generated from this package via `spacetime generate`
