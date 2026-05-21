# Phase 5 Plan 2 Summary: Entity CRUD Routes

## Status: COMPLETE

## What Was Done

Implemented GET and PUT API routes for all three entity domains (agents, skills, rules) using a shared factory-function approach that eliminates duplication.

### Files Created (7)

1. **`packages/luca-studio/lib/entity-route-helpers.ts`** -- Shared helper module with two factory functions:
   - `createEntityListHandler(domain)` -- Scans `src/{domain}/general/` and `src/{domain}/luca/` (or `profiles/` for rules) via Bun Glob, reads each entity file with `readEntityFile()`, returns array of summaries
   - `createEntityDetailHandler(domain)` -- Returns `{ GET, PUT }` handlers for single-entity operations with full ETag support and error handling

2. **`app/api/entities/agents/route.ts`** -- GET list handler for agents
3. **`app/api/entities/agents/[name]/route.ts`** -- GET single + PUT for agents
4. **`app/api/entities/skills/route.ts`** -- GET list handler for skills
5. **`app/api/entities/skills/[name]/route.ts`** -- GET single + PUT for skills
6. **`app/api/entities/rules/route.ts`** -- GET list handler for rules
7. **`app/api/entities/rules/[name]/route.ts`** -- GET single + PUT for rules

### Key Design Decisions

- **Factory functions over code duplication**: All three domains share the same helper module. Each route file is 10-25 lines, delegating entirely to the factory.
- **ETag baked in from the start**: Rather than adding ETag as a separate task, it was integrated into the detail handler factory from the beginning (Tasks 1-4 collapsed into one coherent implementation).
- **Rules profile recursion**: The `resolveEntityPath` function handles nested profile directories (e.g., `src/rules/profiles/typescript/`) via glob pattern `*/{name}.rule.ts`.
- **No Zod schema validation on PUT body**: The plan specified accepting `{ rawConfigText, metadata }` directly, not applying the entity config schemas (those are in `src/` and represent the compiled schema, not the raw config text format).

### Verification

- `bunx --bun tsc --noEmit` passes (only pre-existing errors in `shared-constant-registry.ts` remain, unrelated to this plan)
- GET list endpoints scan both `general/` and `luca/` (or `profiles/` for rules) subdirectories
- GET detail endpoints return full extraction result with ETag header
- PUT endpoints check If-Match for optimistic concurrency (409 Conflict)
- 404 returned for unknown entity names
- 422 returned for malformed entities or missing request body fields
- 500 returned for unexpected write failures

### Deviations

None. All tasks completed as specified.

## Success Criteria Check

- [x] `GET /api/entities/agents` returns all agent summaries with parsed frontmatter
- [x] `GET /api/entities/agents/[name]` returns full parsed config for any agent
- [x] `PUT /api/entities/agents/[name]` writes valid TypeScript and returns 200
- [x] Same patterns work for skills and rules
- [x] Invalid config returns 422 with structured errors
- [x] Stale ETag returns 409 with conflict info
- [x] Non-existent entities return 404
