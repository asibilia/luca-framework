# 109-02 Summary: Extract readJsonSnapshot Helper and API Route Factory

## Status: COMPLETE

## What Changed

### Task 109-02-1: readJsonSnapshot Generic Helper

Extracted a generic `readJsonSnapshot<T>` function in `packages/luca-observer/lib/file-watcher.ts` that encapsulates the repeated read-parse-validate pattern (read file from `.planning/`, JSON.parse, safeParse with Zod schema, return null on failure).

Refactored three functions to use it:

- `readHarnessResult` -- reduced from 15 lines to 1 line (delegate to helper)
- `readSessionPlan` -- reduced from 10 lines to 1 line
- `readTribunalResult` -- reduced from 12 lines to 1 line

Key type detail: Used `z.ZodType<T, ZodTypeDef, unknown>` to correctly handle Zod schemas with `.default()` fields, ensuring the output type (with defaults applied) maps properly rather than the input type.

### Task 109-02-2: createFileReaderRoute Factory

Created `packages/luca-observer/lib/route-factory.ts` with a factory function that generates Next.js GET route handlers. Supports three response shapes:

| Shape      | Behavior                                          | Example Route                              |
| ---------- | ------------------------------------------------- | ------------------------------------------ |
| `direct`   | Returns reader result as JSON                     | /api/state, /api/memory, /api/metrics      |
| `nullable` | Wraps as `{ [key]: result, has_[key]: boolean }`  | /api/harness, /api/planning, /api/tribunal |
| `array`    | Wraps as `{ [key]: result, total_count: length }` | /api/iterations                            |

### Task 109-02-3: Refactored 7 API Routes

All 7 routes now use `createFileReaderRoute`:

1. `/api/state/route.ts` -- direct shape
2. `/api/harness/route.ts` -- nullable shape, key: "result"
3. `/api/iterations/route.ts` -- array shape, key: "iterations"
4. `/api/planning/route.ts` -- nullable shape, key: "plan"
5. `/api/tribunal/route.ts` -- nullable shape, key: "result"
6. `/api/memory/route.ts` -- direct shape
7. `/api/metrics/route.ts` -- direct shape

Each route file preserves its existing JSDoc documentation and `export const dynamic = "force-dynamic"` declaration. Routes with custom logic (agents, ledger, notes, stream, events, events-query, sessions) were NOT refactored per plan.

## Files Changed

| File                                                 | Change                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/luca-observer/lib/file-watcher.ts`         | Added `readJsonSnapshot<T>` helper; refactored 3 reader functions |
| `packages/luca-observer/lib/route-factory.ts`        | **NEW** -- `createFileReaderRoute` factory                        |
| `packages/luca-observer/app/api/state/route.ts`      | Refactored to use factory                                         |
| `packages/luca-observer/app/api/harness/route.ts`    | Refactored to use factory                                         |
| `packages/luca-observer/app/api/iterations/route.ts` | Refactored to use factory                                         |
| `packages/luca-observer/app/api/planning/route.ts`   | Refactored to use factory                                         |
| `packages/luca-observer/app/api/tribunal/route.ts`   | Refactored to use factory                                         |
| `packages/luca-observer/app/api/memory/route.ts`     | Refactored to use factory                                         |
| `packages/luca-observer/app/api/metrics/route.ts`    | Refactored to use factory                                         |

## Lines of Code Impact

- **Removed**: ~105 lines of duplicated boilerplate across 7 route files + 3 reader functions
- **Added**: ~45 lines in `readJsonSnapshot` helper + route factory
- **Net reduction**: ~60 lines

## Verification

- All 20 luca-observer tests pass (0 failures)
- No new type errors introduced (14 pre-existing errors in page.tsx files remain unchanged)
- All refactored routes preserve identical API response shapes

## Deviations

None. Plan executed as specified.
