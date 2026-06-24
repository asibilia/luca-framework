# Phase 213: DRY & Convention Cleanup — Context

## Phase Goal

Address DRY violations, convention inconsistencies, and dead code from the v8.3.0 audit.

## Complexity

SIMPLE — mechanical cleanup, no behavioral changes.

## Decisions (all from audit)

1. Extract STUDIO_PATH_PREFIXES + SIDECAR constants into ~/lib/constants.ts
2. Migrate node:fs/promises to Bun.file() in entity-route-helpers.ts
3. Align interface/type convention (type for local shapes)
4. Extract entityType-to-domainPlural mapping into shared lookup
5. Remove dead code (\_payload parse, incomplete barrel exports, console.log placeholder)
