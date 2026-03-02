# Plan 87-A: Type State Guards — Replace `any` Usages

## Goal

Replace 18+ `any` type usages across 5 files in `packages/luca-framework/src/state/` with proper typed alternatives.

## Context

- @packages/luca-framework/src/state/types.ts — Defines WorkflowContext, WorkflowEvent (discriminated union)
- @packages/luca-framework/src/state/guards.ts — 16 `any` instances (context: any, event?: any)
- @packages/luca-framework/src/state/machine.ts — 1 `any` (event: any in recordPhaseActorDone)
- @packages/luca-framework/src/state/persistence.ts — 2 `any` (snapshot as any, catch err: any)
- @packages/luca-framework/src/state/bridge.ts — 3 `any` (includes(), value, snapshotJson)
- @packages/luca-framework/src/state/events.ts — 1 `any` (Record<string, any> return type)

## Tasks

### Wave 1: guards.ts (16 instances)

- [ ] T1: Import `WorkflowContext` and `WorkflowEvent` types
- [ ] T2: Replace all `context: any` → `context: WorkflowContext` (14 guard functions)
- [ ] T3: Replace all `event?: any` → `event?: WorkflowEvent` (4 guard functions)
- [ ] T4: Type `getGateField` return properly

### Wave 2: machine.ts, persistence.ts, bridge.ts, events.ts

- [ ] T5: machine.ts — Type `recordPhaseActorDone` event as `DoneActorEvent<PhaseActorOutput>`
- [ ] T6: persistence.ts — Remove `as any` cast on createActor snapshot, type catch as `unknown`
- [ ] T7: bridge.ts — Replace 3 `any` usages with `unknown` or proper types
- [ ] T8: events.ts — Create `ContextSummary` type, replace `Record<string, any>` return

## Verification

- `bunx --bun tsc --noEmit` passes
- `bun test` passes
- No `any` remaining in state domain (grep confirms 0 matches)

## Success Criteria

- All 18+ `any` instances replaced with proper types
- TypeScript compiles cleanly
- All tests pass
