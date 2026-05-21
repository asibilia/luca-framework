# PLAN-03-01 Summary: MuninnDB API Layer — 8 New Routes + Enhanced Filtering

## Result: COMPLETE

**Duration:** ~10 minutes
**Commits:** 5

## Tasks Completed

| #   | Task                                           | Commit     | Status |
| --- | ---------------------------------------------- | ---------- | ------ |
| 1   | Foundation: schemas, types, client methods     | `e3f8d805` | Done   |
| 2   | Enhance engrams route with filtering           | `6e855443` | Done   |
| 3   | Build 3 direct-proxy routes                    | `deb56341` | Done   |
| 4   | Build 3 composed routes                        | `83bcbf2a` | Done   |
| 5   | Build 2 complex composed routes + verification | `8b6a5dc0` | Done   |

## What Was Built

### Foundation (lib/)

- **muninn-schemas.ts** — 13 new Zod schemas (8 request schemas: ContradictionsQuery, EntityQuery, EntityTimelineQuery, EntityClustersQuery, TraverseRequest, ExplainRequest, FindByEntityRequest, ExportGraphRequest; 8 response schemas for each route). Enhanced EngramsQuerySchema with tag/type/entity/since optional filters.
- **muninn-types.ts** — 8 new TypeScript interfaces: MuninnEntity, MuninnTimelineEntry, MuninnEntityTimeline, MuninnEntityEngram, MuninnContradiction, MuninnTraverseNode, MuninnExplainResult, MuninnEntityCluster.
- **muninn-config.ts** — 8 new MuninnClient methods (3 direct REST + 5 composed). Updated listEngrams to accept optional tags parameter.

### Routes (app/api/muninn/)

| Route                              | Method | Type         | Pattern                                  |
| ---------------------------------- | ------ | ------------ | ---------------------------------------- |
| /api/muninn/engrams                | GET    | Enhanced     | Added tag/type/entity/since filters      |
| /api/muninn/contradictions         | GET    | Direct proxy | Like stats route                         |
| /api/muninn/traverse               | POST   | Direct proxy | Like activate route                      |
| /api/muninn/explain                | POST   | Direct proxy | Like activate route                      |
| /api/muninn/entity/[name]          | GET    | Composed     | Dynamic segment, Next.js 15 async params |
| /api/muninn/entity/[name]/timeline | GET    | Composed     | Nested dynamic, Next.js 15 async params  |
| /api/muninn/find-by-entity         | POST   | Composed     | From engrams tags filter                 |
| /api/muninn/entity-clusters        | GET    | Composed     | Tag co-occurrence computation            |
| /api/muninn/export-graph           | POST   | Composed     | JSON-LD assembly from engrams            |

### Composition Strategy

3 routes have direct MuninnDB REST equivalents (contradictions, traverse, explain). The other 5 are composed from available REST primitives:

- **findByEntity** — engrams with tags filter
- **entity** — engrams with tags filter + links lookup (best-effort)
- **entityTimeline** — engrams with tags filter, sorted chronologically
- **entityClusters** — fetch all engrams, compute pairwise tag co-occurrence
- **exportGraph** — fetch all engrams, assemble JSON-LD graph from entity tags

## Deviations

- **[Rule 1 - Bug] MuninnEntity.relationships type** — Changed from strict typed array to `unknown[]` because the composed entity method returns raw link data from MuninnDB whose shape varies. The strict type would have caused a compile error.

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors after all 5 tasks.
- All routes follow existing patterns exactly (muninnProxyHandler, parseQueryParams, schema validation).
- No modifications to muninn-route-helper.ts (as required).

## Files Created

- `packages/luca-observer/app/api/muninn/contradictions/route.ts`
- `packages/luca-observer/app/api/muninn/traverse/route.ts`
- `packages/luca-observer/app/api/muninn/explain/route.ts`
- `packages/luca-observer/app/api/muninn/entity/[name]/route.ts`
- `packages/luca-observer/app/api/muninn/entity/[name]/timeline/route.ts`
- `packages/luca-observer/app/api/muninn/find-by-entity/route.ts`
- `packages/luca-observer/app/api/muninn/entity-clusters/route.ts`
- `packages/luca-observer/app/api/muninn/export-graph/route.ts`

## Files Modified

- `packages/luca-observer/lib/muninn-schemas.ts`
- `packages/luca-observer/lib/muninn-types.ts`
- `packages/luca-observer/lib/muninn-config.ts`
- `packages/luca-observer/app/api/muninn/engrams/route.ts`
