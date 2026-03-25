---
phase: 201
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 201 Plan 2: Config Route ETag Concurrency

## Objective

Add If-Match concurrency checking to all 6 config section PUT routes and track the config ETag on the client side, closing the optimistic locking gap identified in research.

> Appetite: Large (200K tokens, ~67K tokens remaining per wave at 60% context budget)

Entity routes already have full ETag concurrency (428 missing header, 409 mismatch). Config section routes set ETag on responses but do NOT check If-Match on writes. The fix is contained: modify the single `createConfigSectionHandler()` factory to cover all 6 routes, add a `configEtagAtom` to track the ETag on the client, and wire the existing save hook to send `If-Match`.

Critical constraint from research: Config GET computes ETag from the full raw file. Config section PUT currently computes ETag from section-only JSON. These must be reconciled -- use full-file ETag for both to catch any concurrent write to any section.

## Context

@packages/luca-studio/lib/config-section-handler.ts (factory to modify)
@packages/luca-studio/lib/etag.ts (computeETag utility)
@packages/luca-studio/app/api/config/route.ts (GET route with full-file ETag)
@packages/luca-studio/stores/config-atoms.ts (needs configEtagAtom)
@packages/luca-studio/hooks/use-config-hydration.ts (needs to extract ETag from GET)
@packages/luca-studio/hooks/use-pipeline-save.ts (needs to send If-Match on PUT)
@.planning/phases/201-studio-w7-infrastructure/201-RESEARCH.md (route inventory matrix)
@.planning/phases/201-studio-w7-infrastructure/01-PREMORTEM.md (ETag mismatch risk)

## Tasks

### 1. Add If-Match checking to createConfigSectionHandler

**Type:** auto
**TDD:** false
**Depends on:** none

Modify `packages/luca-studio/lib/config-section-handler.ts` to check the `If-Match` header before writing.

Key requirements:

- Extract `If-Match` header from request. If missing, return 428 (Precondition Required) with error message matching entity route pattern
- After reading the full config.json raw content (step 4 in the existing flow), compute ETag from the raw string (NOT from parsed/re-serialized JSON)
- Compare If-Match value to computed ETag. If mismatch, return 409 (Conflict) with `{ error, currentEtag }` matching entity route pattern
- Change the response ETag (step 7) to use full-file content after write, not section-only JSON. This means: after `atomicWrite`, re-read the written file and compute ETag from that raw content
- Preserve all existing behavior (schema validation, semantic validators, atomic write)

**Files to create/edit:**

- `packages/luca-studio/lib/config-section-handler.ts` (MODIFY)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- 428 returned when no If-Match header sent
- 409 returned when If-Match does not match current file ETag
- 200 returned with updated ETag when If-Match matches
- All 6 config PUT routes automatically inherit this behavior

### 2. Add configEtagAtom to client stores

**Type:** auto
**TDD:** false
**Depends on:** none

Add a `configEtagAtom` to `packages/luca-studio/stores/config-atoms.ts` to track the current ETag from the config GET response.

Key requirements:

- `configEtagAtom = atom<string | null>(null)` -- simple primitive atom
- Exported alongside existing atoms
- Starts as null (no ETag until first fetch)
- JSDoc explaining it tracks the full-file ETag from GET /api/config

**Files to create/edit:**

- `packages/luca-studio/stores/config-atoms.ts` (MODIFY)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `configEtagAtom` exported from config-atoms.ts

### 3. Wire ETag extraction in useConfigHydration

**Type:** auto
**TDD:** false
**Depends on:** 2

Modify `packages/luca-studio/hooks/use-config-hydration.ts` to extract the ETag header from the GET /api/config response and store it in `configEtagAtom`.

Key requirements:

- Import and use `useSetAtom(configEtagAtom)`
- After successful fetch, extract `res.headers.get("ETag")` and call `setEtag(etagValue)`
- Also update useSSE hook's config re-fetch path to update the ETag atom when SSE triggers a config refresh (modify `packages/luca-studio/hooks/use-sse.ts` from Wave 1)

**Files to create/edit:**

- `packages/luca-studio/hooks/use-config-hydration.ts` (MODIFY)
- `packages/luca-studio/hooks/use-sse.ts` (MODIFY -- add ETag extraction to config re-fetch)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- After config hydration, `configEtagAtom` holds a non-null 16-char hex string
- SSE-triggered re-fetches also update the ETag atom

### 4. Wire If-Match header in usePipelineSave

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Modify `packages/luca-studio/hooks/use-pipeline-save.ts` to send the `If-Match` header on config PUT requests using the value from `configEtagAtom`.

Key requirements:

- Import `useAtomValue(configEtagAtom)` to read current ETag
- Add `If-Match: etag` header to the PUT `/api/config/workflow` fetch call
- Handle 409 response: show a conflict error message (can use console.error for now; toast will come in Phase 202)
- Handle 428 response: show a "no ETag available" error (should not happen in normal flow but handles edge case)
- On successful save, update `configEtagAtom` with the new ETag from the PUT response

**Files to create/edit:**

- `packages/luca-studio/hooks/use-pipeline-save.ts` (MODIFY)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- PUT request includes `If-Match` header
- Successful save updates the ETag atom with the new value from the response
- 409 response is caught and logged

## Verification

1. Type check passes: `bunx --bun tsc --noEmit` (zero errors)
2. Config PUT without If-Match: returns 428 with descriptive error
3. Config PUT with stale ETag: returns 409 with current ETag in response
4. Config PUT with fresh ETag: returns 200 with new ETag
5. ETag lifecycle: GET config -> extract ETag -> PUT with If-Match -> new ETag -> next PUT uses new ETag
6. SSE integration: External config edit -> SSE fires -> config re-fetched -> new ETag stored -> next PUT uses updated ETag

## Success Criteria

- All 6 config section PUT routes reject requests without If-Match (428)
- All 6 config section PUT routes reject requests with stale ETag (409)
- Config GET and config PUT use the same ETag computation base (full raw file)
- Client tracks ETag across fetch -> save -> re-fetch cycle
- SSE-triggered re-fetches update the tracked ETag (no stale ETag after external edit)

## Output Specification

| Artifact               | Path                                                 | Type     |
| ---------------------- | ---------------------------------------------------- | -------- |
| Updated config handler | `packages/luca-studio/lib/config-section-handler.ts` | Modified |
| Config ETag atom       | `packages/luca-studio/stores/config-atoms.ts`        | Modified |
| ETag-aware hydration   | `packages/luca-studio/hooks/use-config-hydration.ts` | Modified |
| ETag-aware SSE hook    | `packages/luca-studio/hooks/use-sse.ts`              | Modified |
| If-Match save hook     | `packages/luca-studio/hooks/use-pipeline-save.ts`    | Modified |
