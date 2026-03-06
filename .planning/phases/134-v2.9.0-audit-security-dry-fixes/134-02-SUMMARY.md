---
id: 134-02
status: complete
---

# Summary: Extract shared circuit breaker utility

## Tasks Completed

### T1: Create createCircuitBreaker() factory

- Created `packages/luca-framework/src/state/__helpers/circuit-breaker.ts`
- Exports `CircuitBreaker` interface and `createCircuitBreaker()` factory
- Lightweight timestamp-based cooldown pattern with `isOpen()`, `trip()`, `reset()` methods

### T2: Refactor observer-emitter.ts

- Replaced `_emitterLastFailureAt` state variable and `EMITTER_COOLDOWN_MS` constant with `emitterBreaker` instance
- Replaced 5 inline state assignments (`_emitterLastFailureAt = Date.now()` / `= 0`) with `emitterBreaker.trip()` / `.reset()`
- Replaced manual circuit open check with `emitterBreaker.isOpen()`
- Preserved `_resetEmitterCircuitBreaker()` export for backward compatibility

### T3: Refactor spacetimedb-client.ts

- Replaced `_lastFailureAt` state variable, `CIRCUIT_BREAKER_COOLDOWN_MS` constant, and `isCircuitOpen()` function with `queryBreaker` instance
- Replaced 3 inline state assignments with `queryBreaker.trip()` / `.reset()`
- Preserved `_resetCircuitBreaker()` export for backward compatibility

## Files Changed

- `packages/luca-framework/src/state/__helpers/circuit-breaker.ts` (new)
- `packages/luca-framework/src/state/__helpers/observer-emitter.ts`
- `packages/luca-framework/src/state/__helpers/spacetimedb-client.ts`

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors
- No inline circuit breaker state remains in either consumer file
