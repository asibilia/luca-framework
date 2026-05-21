# Wave 4 Summary: Final Wiring (DAG-Adapter Bridge + Domain Barrel + Registration)

**Phase:** 6 — Adapter Architecture
**Wave:** 4
**Status:** COMPLETE
**Tasks:** 5/5

## Commits

| Task | Commit     | Description                                                 |
| ---- | ---------- | ----------------------------------------------------------- |
| 1    | `6e10792a` | Create adapter-executor bridge (B09)                        |
| 2    | `1c5b7729` | Narrow executeStep types from unknown to WorkflowStep (B09) |
| 3    | `3ce0c4e9` | Create adapters domain barrel (B10)                         |
| 4    | `290ef487` | Create built-in adapter registration (B10)                  |
| 5    | `0eafc748` | Add adapters directory tree to generation-system docs (B10) |

## Files Created

- `src/adapters/__helpers/adapter-executor-bridge.ts` — Bridge between full T3 Adapter and T1 WorkflowAdapter
- `src/adapters/index.ts` — Domain barrel (pure re-exports only)
- `src/adapters/__helpers/register-builtins.ts` — Side-effect module for pre-registering Claude + API adapters

## Files Modified

- `src/adapters/__schemas/adapter.schemas.ts` — Added WorkflowStep import, narrowed executeStep parameter type
- `src/adapters/claude/claude-adapter.ts` — Added WorkflowStep import, narrowed executeStep parameter type
- `src/adapters/api/api-adapter.ts` — Added WorkflowStep import, replaced unsafe casts with typed access
- `docs/generation-system.md` — Added src/adapters/ directory tree to documentation

## Deviations

### [Rule 3 - Blocking] Zod z.function() input/output type mismatch

The T1 `Adapter` type in `workflow.schemas.ts` uses `z.function()` with `WorkflowStepSchema` as a parameter. Zod's `z.function()` produces an "input" type where `.default()` fields become optional (e.g., `dependsOn?: string[] | undefined`), while `z.infer<typeof WorkflowStepSchema>` produces an "output" type where defaults are required (`dependsOn: string[]`).

This created a type incompatibility in the bridge where the step parameter (input type) could not be passed directly to the T3 adapter (which expects output type). Fixed with a type assertion (`step as WorkflowStep`) in the bridge, documented with a comment explaining why the assertion is safe (the DAG executor always provides fully-parsed steps with all defaults applied).

## Verification

- `bunx --bun tsc --noEmit` — passes with zero errors
- `bun run scripts/check-domain-boundaries.ts` — passes with zero violations
- `adapters: 3` confirmed in boundary script (already present at line 38)
- Barrel contains only re-export statements (no logic, no side effects)
- `register-builtins.ts` is NOT imported by the barrel
- All files use kebab-case naming
- No classes used
- Aliased imports used for Adapter name collision (FullAdapter, WorkflowAdapter)

## Architecture Notes

- The bridge pattern is necessary because T1 (workflow) cannot import T3 (adapters). The bridge lives in T3 and maps the full Adapter to the minimal WorkflowAdapter shape.
- `durationMs: 0` and `retryCount: 0` in the bridge are intentional — the DAG executor measures timing and manages retries externally.
- The `register-builtins.ts` side-effect pattern keeps the barrel pure while allowing consumers to opt into pre-registration by importing explicitly.
