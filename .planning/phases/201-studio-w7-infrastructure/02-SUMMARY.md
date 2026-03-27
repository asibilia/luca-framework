# Phase 201 Plan 2 Summary: Config Route ETag Concurrency

## Objective

Add optimistic concurrency control (If-Match / ETag) to the config section PUT route and wire the full client-side ETag lifecycle so that concurrent config edits are detected and prevented.

## Tasks Completed

| #   | Task                                                | Commit     | Files                                               |
| --- | --------------------------------------------------- | ---------- | --------------------------------------------------- |
| 1   | Add If-Match checking to createConfigSectionHandler | `e19e1ff6` | `lib/config-section-handler.ts`                     |
| 2   | Add configEtagAtom to client stores                 | `1b2eb1d3` | `stores/config-atoms.ts`                            |
| 3   | Wire ETag extraction in useConfigHydration + useSSE | `b9c94165` | `hooks/use-config-hydration.ts`, `hooks/use-sse.ts` |
| 4   | Wire If-Match header in usePipelineSave             | `bc17c180` | `hooks/use-pipeline-save.ts`                        |

## Key Design Decisions

**Full-file ETag reconciliation:** The critical constraint was that GET /api/config computes ETag from the full raw config.json content, but the config section PUT was computing ETag from section-only JSON. This caused an ETag mismatch that would make concurrency control impossible. The fix reconciles both paths to use full-file ETag:

- Server: `createConfigSectionHandler` now reads the raw file, computes ETag from full content, and returns the full-file ETag after write
- Client: `configEtagAtom` stores the full-file ETag from GET responses, and `usePipelineSave` sends it as If-Match

**Fail-closed semantics:** If-Match is mandatory on PUT (428 if missing). This matches the pattern in `entity-route-helpers.ts` and prevents writes without concurrency tokens.

**ETag lifecycle:** The ETag flows through four update points:

1. Initial hydration (`useConfigHydration`) -- seeds ETag from first GET
2. SSE re-fetch (`useSSE`) -- updates ETag when config.json changes on disk
3. Save response (`usePipelineSave`) -- updates ETag from PUT response
4. Server handler (`createConfigSectionHandler`) -- computes fresh ETag from written file

## Deviations

None. All tasks executed as planned.

## Verification

- `bunx --bun tsc --noEmit` passes cleanly (0 errors)
