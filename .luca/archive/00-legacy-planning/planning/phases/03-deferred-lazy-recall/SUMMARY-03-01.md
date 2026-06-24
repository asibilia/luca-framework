# SUMMARY: PLAN-03-01 — Deferred Recall Infrastructure

**Phase:** 3
**Plan:** PLAN-03-01
**Wave:** 1
**Status:** COMPLETE
**Branch:** 61--v3.3-cognitive-maturity
**Duration:** ~4.5 minutes (2026-03-09T19:55:48Z to 2026-03-09T20:00:15Z)

## Objective

Create the foundational infrastructure for deferred/lazy recall: extend CognitionConfig with `eager_recall`, create the session-scoped recall cache, add `requestMemoryContext()`, and update barrel exports.

## Tasks Completed

### Task 1: Add eager_recall to CognitionConfigSchema

- **Commit:** `d8af27e0`
- **File:** `src/agents/__schemas/agent.schemas.ts`
- **Change:** Added `eager_recall: z.boolean().optional()` to `CognitionConfigSchema`
- **Deviation:** [Rule 3 - Blocking] Used `.optional()` instead of `.default(false)` because all 37 agent files construct `cognition` objects as typed literals against `z.infer<>` (output type). Using `.default(false)` would produce output type `boolean` (required), breaking every agent file that omits the field. `.optional()` produces `boolean | undefined` in the output type, allowing existing agents to compile unchanged. Consumers use `?? false` for the same default behavior.

### Task 2: Create recall-cache.ts module

- **Commit:** `62178a33`
- **File:** `src/shared/__helpers/recall-cache.ts` (NEW)
- **Change:** Created session-scoped recall cache with `RecallCacheEntrySchema`, `getCachedRecall()`, `setCachedRecall()`, `hasRecallCache()`, `clearRecallCache()`
- **Pattern:** Module-scoped `Map<string, RecallCacheEntry>` keyed by session ID, matching existing `formatCache` pattern

### Task 3: Add requestMemoryContext() to memory-context-builder.ts

- **Commit:** `5048f89c`
- **File:** `src/shared/__helpers/memory-context-builder.ts`
- **Change:** Added `RequestMemoryContextConfig` interface and `requestMemoryContext()` function. Checks `getCachedRecall()`, logs warning + returns empty string if no cache, delegates to `buildMemoryContextBlock()` when cached

### Task 4: Update shared barrel exports

- **Commit:** `4ff66909`
- **File:** `src/shared/index.ts`
- **Change:** Added recall cache exports (RecallCacheEntrySchema, get/set/has/clear functions, RecallCacheEntry type) and memory context additions (requestMemoryContext, RequestMemoryContextConfig type)

## Verification Results

| Check                                                                 | Result                                        |
| --------------------------------------------------------------------- | --------------------------------------------- |
| `bunx --bun tsc --noEmit`                                             | PASS (zero errors)                            |
| `bun run scripts/check-domain-boundaries.ts`                          | PASS (no violations)                          |
| `CognitionConfigSchema.parse({}).eager_recall`                        | `undefined` (treated as false via `?? false`) |
| `CognitionConfigSchema.parse({ eager_recall: true })`                 | `{ eager_recall: true }`                      |
| All new functions importable from `~/shared`                          | PASS                                          |
| Recall cache get/set/has/clear operations                             | PASS                                          |
| `requestMemoryContext()` returns empty when no cache                  | PASS (with console.warn)                      |
| `requestMemoryContext()` returns `<memory_context>` block when cached | PASS                                          |
| Barrel file remains pure re-exports                                   | PASS                                          |

## Deviations

1. **[Rule 3 - Blocking] eager_recall uses `.optional()` instead of `.default(false)`**
   - **Reason:** `z.infer<>` returns the output type, and all 37 agent files use that type for their literal object constructions. `.default(false)` produces `eager_recall: boolean` (required in output), which would break every agent file that omits the field. `.optional()` produces `eager_recall?: boolean | undefined`, preserving backward compatibility.
   - **Impact:** Consumers must use `config.eager_recall ?? false` instead of relying on schema-provided default. This is documented in the JSDoc comment.
   - **Alternative considered:** Using `z.input<>` for agent config types would allow `.default(false)`, but that would be a larger refactor touching the type used by all agent files.

## Files Changed

| File                                             | Action   | Lines Changed |
| ------------------------------------------------ | -------- | ------------- |
| `src/agents/__schemas/agent.schemas.ts`          | Modified | +14, -0       |
| `src/shared/__helpers/recall-cache.ts`           | Created  | +154          |
| `src/shared/__helpers/memory-context-builder.ts` | Modified | +73, -0       |
| `src/shared/index.ts`                            | Modified | +18, -1       |

## Ready for Plan 2

All infrastructure artifacts are in place for PLAN-03-02 (consumer updates):

- `eager_recall` field available in `CognitionConfig`
- `setCachedRecall()` / `getCachedRecall()` ready for skill-level orchestration
- `requestMemoryContext()` ready to replace direct `buildMemoryContextBlock()` calls
- All exports available via `import { ... } from "~/shared"`
