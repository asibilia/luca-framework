---
title: Rename SpacetimeDB memory field names from *Json to *Md
area: data
created: 2026-03-05
source: PR #50 review comment 2892244057
---

## Context

The `syncMemoryViaReducer` function in `src/memory/__helpers/bridge.ts` serializes memory to markdown (not JSON), but the SpacetimeDB payload keys are still named `brainJson`, `memoryJson`, `workingJson`, `proceduresJson`. This naming mismatch causes confusion for consumers who expect JSON but receive markdown.

## Task

Rename all four fields across the full SpacetimeDB contract:

- `brainJson` -> `brainMd`
- `memoryJson` -> `memoryMd`
- `workingJson` -> `workingMd`
- `proceduresJson` -> `proceduresMd`

### Affected locations

1. **SpacetimeDB schema** (`packages/luca-spacetime/spacetimedb/src/schema.ts`) — field definitions
2. **Reducer** (`packages/luca-spacetime/spacetimedb/src/index.ts`) — `update_memory_files` reducer args
3. **Generated bindings** (`packages/luca-spacetime/spacetimedb/src/module_bindings/`) — `memory_files_table.ts`, `update_memory_files_reducer.ts`
4. **Observer hooks** (`use-memory.ts`) — field access in UI observers
5. **SQL queries** — any raw queries referencing these column names
6. **Bridge caller** (`src/memory/__helpers/bridge.ts`) — payload construction

### Migration steps

1. Update SpacetimeDB schema field names
2. Regenerate module bindings
3. Update reducer to use new field names
4. Update all consumer callsites (observer hooks, SQL queries)
5. Update bridge.ts payload keys
6. Run `--clear-database` to apply schema migration
7. Test end-to-end memory sync flow

## Notes

This is a breaking schema change requiring `--clear-database`. Coordinate with any active SpacetimeDB deployments. The JSDoc on bridge.ts lines 207-208 already documents the actual format as a stopgap.
