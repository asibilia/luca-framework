---
phase: 05
plan: 02
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 5 Plan 2: Entity CRUD Routes

## Objective

Implement GET and PUT API routes for browsing and editing entity files (agents, skills, rules). GET routes parse TypeScript source files using the ts-round-trip read path to return structured config data. PUT routes validate with Zod schemas, serialize back to TypeScript via the round-trip write path, and return the updated entity.

## Context

@packages/luca-studio/lib/ts-round-trip.ts (readEntityFile, writeEntityFile, extractConfigFromSource, generateEntitySource, EntityDomain)
@packages/luca-studio/lib/validation-pipeline.ts (createApiHandler -- reference pattern)
@packages/luca-studio/lib/etag.ts (computeETag)
@packages/luca-studio/lib/project-root.ts (resolveProjectRoot)
@src/agents/**schemas/agent.schemas.ts (AgentConfigSchema)
@src/skills/**schemas/skill.schemas.ts (SkillConfigSchema)
@src/rules/\_\_schemas/rule.schemas.ts (RuleConfigSchema)
@src/agents/general/ (entity file directory structure)
@src/agents/luca/ (entity file directory structure)
@src/skills/general/ (entity file directory structure)
@src/rules/general/ (entity file directory structure)

## Tasks

### 1. Create shared entity route helpers

**Type:** auto
**TDD:** false
**Depends on:** none

Create a shared utility module that provides factory functions for entity list and entity detail/write routes. This avoids duplicating the same glob-scan-parse-respond logic across three domains.

The helpers must handle:

**List helper (`createEntityListHandler`):**

1. Accept a domain ("agents" | "skills" | "rules") and the source directories to scan
2. Glob for `*.agent.ts`, `*.skill.ts`, or `*.rule.ts` files in `src/{domain}/general/` and `src/{domain}/luca/` (if exists)
3. For each file, call `readEntityFile()` to extract metadata
4. Return an array of entity summaries: `{ name, domain, varName, configType, filePath }`
5. Include the raw config text length as a size hint for the UI

**Detail/Write helper (`createEntityDetailHandler`):**

- **GET path:** Read a single entity file by name, return the full extraction result (rawConfigText + metadata) with an ETag computed from the source file contents
- **PUT path:** Accept `{ rawConfigText, metadata }` in the request body, call `writeEntityFile()` to atomically write the TypeScript source, return the updated entity with a fresh ETag

Entity name resolution: Given a name like "lu-router", resolve to the actual file path by scanning `src/{domain}/general/` and `src/{domain}/luca/` for a file matching `{name}.{domain-singular}.ts` (e.g., `lu-router.agent.ts`).

**Files to create:**

- `packages/luca-studio/lib/entity-route-helpers.ts`

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- Helper functions have clean signatures with proper TypeScript types
- Name resolution correctly handles both `general/` and `luca/` subdirectories

### 2. Create agent routes (GET list + GET/PUT single)

**Type:** auto
**TDD:** false
**Depends on:** 1

Create the Next.js App Router route files for agents:

- `GET /api/entities/agents` -- Returns array of agent summaries using the list helper
- `GET /api/entities/agents/[name]` -- Returns full parsed agent config using the detail helper
- `PUT /api/entities/agents/[name]` -- Writes agent config using the detail helper

The list route scans both `src/agents/general/` and `src/agents/luca/` directories. The detail route resolves the agent name to a file path and delegates to the shared helper.

**Files to create:**

- `packages/luca-studio/app/api/entities/agents/route.ts` (GET list)
- `packages/luca-studio/app/api/entities/agents/[name]/route.ts` (GET single + PUT)

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- `GET /api/entities/agents` would return all agent files from both general/ and luca/
- `GET /api/entities/agents/lu-router` would return the full parsed config
- `PUT /api/entities/agents/lu-router` would write back valid TypeScript

### 3. Create skill and rule routes

**Type:** auto
**TDD:** false
**Depends on:** 1

Create the remaining entity routes for skills and rules using the same shared helpers:

**Skills:**

- `GET /api/entities/skills` -- List all skills
- `PUT /api/entities/skills/[name]` -- Write skill

**Rules:**

- `GET /api/entities/rules` -- List all rules
- `PUT /api/entities/rules/[name]` -- Write rule

Note: Skills and rules follow the same directory structure as agents (general/ and luca/ or profiles/ subdirs). The shared helpers handle this via the domain parameter.

Skills have `src/skills/general/` and `src/skills/luca/` directories.
Rules have `src/rules/general/` and `src/rules/profiles/` directories.

**Files to create:**

- `packages/luca-studio/app/api/entities/skills/route.ts` (GET list)
- `packages/luca-studio/app/api/entities/skills/[name]/route.ts` (PUT)
- `packages/luca-studio/app/api/entities/rules/route.ts` (GET list)
- `packages/luca-studio/app/api/entities/rules/[name]/route.ts` (PUT)

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- All skill and rule routes delegate to the shared entity helpers
- Directory scanning covers all subdirectories for each domain

### 4. Add ETag and error handling to entity routes

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Wire up ETag-based optimistic concurrency and consistent error handling across all entity routes:

1. **ETag on GET responses:** Compute ETag from the raw TypeScript source file contents and include in response headers
2. **If-Match on PUT requests:** Read the `If-Match` header, compute ETag from current file on disk, reject with 409 Conflict if they differ
3. **404 handling:** Return 404 when entity name does not resolve to an existing file
4. **422 handling:** Return 422 with structured errors when the round-trip extraction fails (malformed TypeScript)
5. **500 handling:** Return 500 with error message on unexpected write failures

This task touches the shared helpers (adding ETag support) and may require minor updates to the route files created in tasks 2 and 3.

**Files to edit:**

- `packages/luca-studio/lib/entity-route-helpers.ts` (add ETag computation and If-Match checking)

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- GET responses include ETag header
- PUT with stale ETag returns 409 Conflict
- Non-existent entity names return 404
- Malformed TypeScript files return 422

## Verification

- `bunx --bun tsc --noEmit` passes with all new files
- Seven new route files created across three entity domains
- Shared helper module eliminates duplication between domains
- Entity names resolve correctly across general/ and luca/ (or profiles/) subdirectories
- ETag-based optimistic concurrency prevents stale writes
- TypeScript round-trip read/write paths are correctly integrated

## Success Criteria

- `GET /api/entities/agents` returns all agent summaries with parsed frontmatter
- `GET /api/entities/agents/[name]` returns full parsed config for any agent
- `PUT /api/entities/agents/[name]` writes valid TypeScript and returns 200
- Same patterns work for skills and rules
- Invalid config returns 422 with structured errors
- Stale ETag returns 409 with conflict info
- Non-existent entities return 404

## Output Specification

- `packages/luca-studio/lib/entity-route-helpers.ts`
- `packages/luca-studio/app/api/entities/agents/route.ts`
- `packages/luca-studio/app/api/entities/agents/[name]/route.ts`
- `packages/luca-studio/app/api/entities/skills/route.ts`
- `packages/luca-studio/app/api/entities/skills/[name]/route.ts`
- `packages/luca-studio/app/api/entities/rules/route.ts`
- `packages/luca-studio/app/api/entities/rules/[name]/route.ts`
