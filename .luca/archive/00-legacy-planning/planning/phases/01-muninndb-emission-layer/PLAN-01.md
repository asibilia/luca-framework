---
phase: 1
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 01 Plan 1: Core Emitter Module

## Objective

Create the `packages/luca-framework/src/emitter/` module with all foundational components: Zod schemas, MuninnDB HTTP client, closure-based circuit breaker, timer-based batch queue, high-level emit functions, and barrel index. This module provides the complete emission pipeline but does NOT integrate with any existing code yet.

## Context

Read these files for patterns and conventions:

- @packages/luca-observer/lib/muninn-config.ts (HTTP client singleton pattern, AbortController timeout, Bearer auth)
- @packages/luca-framework/src/state/ledger.ts (append-only write pattern, fire-and-forget)
- @packages/luca-framework/src/state/bridge.ts (fire-and-forget via `.catch()` and `void`)
- @.planning/phases/01-muninndb-emission-layer/01-CONTEXT.md (locked decisions)
- @.planning/phases/01-muninndb-emission-layer/01-RESEARCH.md (architecture patterns, schemas, anti-patterns)

## Tasks

### 1. Create Zod Schemas

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-framework/src/emitter/__schemas/emitter.schemas.ts` with all Zod schemas and inferred types.

Schemas to define (all using snake_case for API-facing fields per project convention):

1. `emitterConfigSchema` -- top-level emitter configuration (base_url, api_key, vault, timeout_ms, circuit_breaker, batch)
2. `circuitBreakerConfigSchema` -- circuit breaker thresholds (max_failures: 5, reset_timeout_ms: 30_000, half_open_max: 1)
3. `batchQueueConfigSchema` -- batch queue settings (flush_interval_ms: 2_000, threshold: 10)
4. `emissionEventSchema` -- structured event payload (event_type, timestamp, session_id, data, metadata)
5. `emissionEngramSchema` -- MuninnDB engram shape (vault, concept, content, tags, confidence)
6. `emissionMetadataSchema` -- common metadata fields (milestone, phase, complexity, branch)

All schemas MUST define defaults in the schema (not in destructuring). Use `safeParse()` in consumer code.

Export all schemas and their inferred types (`EmitterConfig`, `CircuitBreakerConfig`, `BatchQueueConfig`, `EmissionEvent`, `EmissionEngram`, `EmissionMetadata`).

**Files to create:**

- `packages/luca-framework/src/emitter/__schemas/emitter.schemas.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All schemas have `.default()` values for optional fields
- Types are exported via `z.infer<typeof schema>`

### 2. Create MuninnDB HTTP Client

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-framework/src/emitter/__helpers/muninn-http.ts` -- a lightweight HTTP client for writing engrams to MuninnDB.

Follow the pattern from `packages/luca-observer/lib/muninn-config.ts`:

- Factory function `createMuninnHttpClient(config)` returning an object with `writeEngram()` method
- Use Bun native `fetch` (not node:http)
- AbortController with configurable timeout (default 5_000ms -- shorter than observer's 10s)
- Bearer auth header when `api_key` is non-empty
- Returns `{ id: string } | null` (null on failure, never throws)
- Single endpoint: `POST /api/engrams` (CRITICAL: not `/api/remember`)

Do NOT import from `packages/luca-observer/`. Replicate the pattern locally.

Accept config via the `emitterConfigSchema` parsed values (base_url, api_key, timeout_ms).

The `writeEngram` function accepts an `EmissionEngram` (parsed from schema) and sends it as POST body.

**Files to create:**

- `packages/luca-framework/src/emitter/__helpers/muninn-http.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Function returns `Promise<{ id: string } | null>`
- Uses AbortController for timeout
- No imports from `packages/luca-observer/`

### 3. Create Circuit Breaker

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-framework/src/emitter/__helpers/circuit-breaker.ts` -- a closure-based circuit breaker (no classes).

Factory function `createCircuitBreaker(config: CircuitBreakerConfig)` returns:

- `execute<T>(fn: () => Promise<T>): Promise<T | null>` -- wraps an async function with circuit breaker logic
- `getState(): { state: "closed" | "open" | "half-open"; failures: number }` -- introspection
- `reset(): void` -- manual reset

State machine logic:

- **closed**: Normal operation. On failure, increment failure count. When failures >= max_failures, transition to open.
- **open**: All calls return null immediately. After reset_timeout_ms elapsed since last failure, transition to half-open.
- **half-open**: Allow 1 probe request (half_open_max). On success, transition to closed and reset failures. On failure, transition back to open.

Use closures for all state (failures count, state enum, lastFailureTime). No classes.

Log state transitions at debug level using consola.

**Files to create:**

- `packages/luca-framework/src/emitter/__helpers/circuit-breaker.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Factory function returns typed object (not a class)
- State transitions follow closed -> open -> half-open -> closed cycle

### 4. Create Batch Queue

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-framework/src/emitter/__helpers/batch-queue.ts` -- a timer-based batch accumulator.

Factory function `createBatchQueue(config: { flush_interval_ms: number; threshold: number; send: (engram: EmissionEngram) => Promise<unknown> })` returns:

- `enqueue(engram: EmissionEngram): void` -- adds engram to queue, triggers flush if threshold reached
- `flush(): Promise<void>` -- force-flush all queued engrams (used on session end)
- `size(): number` -- current queue length

Flush behavior:

- Timer fires every `flush_interval_ms` (default 2s). On fire, flush all queued engrams.
- If queue reaches `threshold` (default 10), flush immediately and cancel pending timer.
- Flush sends each engram individually via the provided `send` function using `Promise.allSettled()` (no batch REST endpoint).
- Flush is idempotent: if queue is empty, no-op.
- Use `setTimeout` / `clearTimeout` for timer management.

The `send` callback is injected at creation time (dependency injection) -- this allows the circuit breaker to wrap the HTTP client before passing to the queue.

**Files to create:**

- `packages/luca-framework/src/emitter/__helpers/batch-queue.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Uses `Promise.allSettled()` for batch sends
- Timer is properly cleaned up on early flush

### 5. Create Emit Functions and Barrel Index

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4

Create `packages/luca-framework/src/emitter/__helpers/emit-functions.ts` -- high-level convenience functions for emitting lifecycle events. Also create the barrel index at `packages/luca-framework/src/emitter/index.ts`.

**Singleton emitter pattern** (following `getMuninnClient()` from observer):

- Module-level `_emitter` variable, lazily initialized on first call
- `createEmitter(rawConfig)` factory that wires together HTTP client, circuit breaker, and batch queue
- `getEmitter(): EmitterInstance` singleton accessor

The `createEmitter` factory:

1. Parse config with `emitterConfigSchema.safeParse(rawConfig)` -- if parsing fails, log a warning and fall back to schema defaults via `emitterConfigSchema.parse({})`. The emitter MUST never crash on invalid config; it degrades to a no-op configuration.
2. Create HTTP client via `createMuninnHttpClient(config)`
3. Create circuit breaker via `createCircuitBreaker(config.circuit_breaker)`
4. Create batch queue with `send` callback that routes through circuit breaker then HTTP client
5. Return object with `emit()`, `flush()`, `getCircuitState()` methods

**Convenience emit functions** (all fire-and-forget, accept plain data objects, never throw):

- `emitSessionStart(params: { session_id, branch, complexity, milestone })` -- concept: `emit:session:start`
- `emitSessionEnd(params: { session_id, duration_ms, engram_count })` -- concept: `emit:session:end`, also calls `flush()`
- `emitStateTransition(params: { previous_state, current_state, event_type, session_id, metadata })` -- concept: `emit:state:transition`
- `emitPhaseStart(params: { phase_id, session_id, metadata })` -- concept: `emit:phase:start`
- `emitPhaseComplete(params: { phase_id, status, session_id, metadata })` -- concept: `emit:phase:complete`
- `emitDecision(params: { decision, rationale, session_id, metadata })` -- concept: `emit:decision:made`
- `emitError(params: { error_type, message, session_id, metadata })` -- concept: `emit:error:captured`
- `emitAgentSpawn(params: { agent_name, session_id, metadata })` -- concept: `emit:agent:spawn`
- `emitAgentComplete(params: { agent_name, status, session_id, metadata })` -- concept: `emit:agent:complete`
- `emitFinding(params: { finding_type, content, session_id, metadata })` -- concept: `emit:finding:captured`

Each convenience function:

1. Builds an `EmissionEvent` object with timestamp, session_id, data, metadata
2. Builds an `EmissionEngram` with concept, JSON-stringified content, tags, confidence
3. Calls `getEmitter().emit(engram)` which enqueues into batch queue

Tag generation follows CONTEXT.md taxonomy:

- Always include: `session:<session_id>`
- Include if available: `phase:<N>`, `milestone:<version>`
- Category tag: `lifecycle`, `decision`, `finding`, `error`, `agent`

Entity annotations (if MuninnDB supports them in the engram payload): `session:<id>`, `agent:<name>`, `phase:<milestone>:<number>`

All functions are exported as named exports. No default exports.

**Barrel index** (`packages/luca-framework/src/emitter/index.ts`):

Pure barrel file with only re-export statements. Re-export:

- All schemas and types from `__schemas/emitter.schemas.ts`
- All emit convenience functions from `__helpers/emit-functions.ts`
- `createCircuitBreaker` and `CircuitBreakerConfig` type from `__helpers/circuit-breaker.ts`
- `createBatchQueue` from `__helpers/batch-queue.ts`
- `createMuninnHttpClient` from `__helpers/muninn-http.ts`
- `createEmitter`, `getEmitter` from `__helpers/emit-functions.ts`

The barrel MUST contain only `export { ... } from` and `export type { ... } from` statements. No logic, no schemas, no constants.

**Files to create:**

- `packages/luca-framework/src/emitter/__helpers/emit-functions.ts`
- `packages/luca-framework/src/emitter/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All emit functions accept plain data objects (no state module imports)
- Singleton pattern matches observer's `getMuninnClient()` style
- Tags follow CONTEXT.md taxonomy
- Config parsing uses `safeParse()` with fallback to defaults (never crashes)
- Agent lifecycle functions (`emitAgentSpawn`, `emitAgentComplete`) and `emitFinding` are exported
- Barrel index contains only re-export statements
- All public API surface is accessible via `import { ... } from "../emitter"`

**NOTE for executor:** CONTEXT.md (Gray Area 1) references `POST /api/remember_batch` as the batch endpoint. This is stale -- the correct single-engram write endpoint is `POST /api/engrams`. The emitter sends engrams individually (no batch REST endpoint). Do not use `/api/remember` or `/api/remember_batch`.

## Verification

After all tasks complete:

1. `bunx --bun tsc --noEmit` passes with zero errors
2. Directory structure matches:
   ```
   packages/luca-framework/src/emitter/
   ├── __schemas/
   │   └── emitter.schemas.ts
   ├── __helpers/
   │   ├── circuit-breaker.ts
   │   ├── muninn-http.ts
   │   ├── batch-queue.ts
   │   └── emit-functions.ts
   └── index.ts
   ```
3. No imports from `packages/luca-observer/` (cross-package boundary)
4. No imports from `../state/` internals (accept context as parameters)
5. No class declarations (functional patterns only)
6. All schemas use `.default()` for optional fields
7. All API-facing field names use snake_case
8. Config parsing uses `safeParse()` with graceful fallback

## Success Criteria

- The emitter module compiles without errors
- All 10 convenience emit functions are exported and callable (session start/end, state transition, phase start/complete, decision, error, agent spawn/complete, finding)
- Circuit breaker correctly implements closed/open/half-open state machine
- Batch queue accumulates and flushes engrams with timer and threshold
- HTTP client targets `POST /api/engrams` (not `/api/remember`)
- Config parsing never crashes -- invalid config degrades to no-op defaults
- Module has zero external dependencies beyond what is already in package.json

## Output Specification

- 6 new TypeScript files in `packages/luca-framework/src/emitter/`
- No modifications to existing files
- All public API exported through barrel index
