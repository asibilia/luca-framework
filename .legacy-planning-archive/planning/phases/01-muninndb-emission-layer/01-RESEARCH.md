# Phase 01: MuninnDB Emission Layer - Research

**Researched:** 2026-03-09
**Domain:** MuninnDB HTTP API integration, event emission pipeline, circuit breaker patterns
**Confidence:** HIGH

## Summary

This research investigates how to implement the MuninnDB emission layer within the luca-framework package. The emission layer replaces the deleted SpacetimeDB emitter with fire-and-forget MuninnDB HTTP API calls, using a closure-based circuit breaker and batch queue.

The codebase has a clear placement for this: a new `emitter` directory inside `packages/luca-framework/src/` (sibling to `state/`, `utils/`, `commands/`). The MuninnDB REST API uses `POST /api/engrams` for single writes (not `/api/remember` as the CONTEXT.md stated -- this is a critical correction verified from official docs and existing observer code). No batch endpoint exists in the REST API, so batching must be implemented as multiple sequential `POST /api/engrams` calls or by accumulating and sending individually.

**Primary recommendation:** Create `packages/luca-framework/src/emitter/` with `__schemas/`, `__helpers/`, and `index.ts` barrel. Reuse the HTTP client pattern from `packages/luca-observer/lib/muninn-config.ts` but build a framework-local copy (no cross-package import -- observer is a Next.js app, framework is a CLI package).

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library          | Version  | Purpose                                 | Why Standard                                            |
| ---------------- | -------- | --------------------------------------- | ------------------------------------------------------- |
| zod              | ^4.3.6   | Schema validation for emission payloads | Already in luca-framework deps, project-wide convention |
| Bun native fetch | built-in | HTTP calls to MuninnDB API              | Project convention: Bun APIs over node equivalents      |

### Supporting

| Library | Version  | Purpose                                 | When to Use                                               |
| ------- | -------- | --------------------------------------- | --------------------------------------------------------- |
| consola | ^3.4.0   | Structured logging for emission errors  | Already in luca-framework deps, used by `utils/logger.ts` |
| lodash  | ^4.17.23 | Safe property access, cloneDeep         | Already in deps, project convention                       |
| pathe   | ^2.0.3   | Path utilities (if config paths needed) | Already in deps                                           |

### Alternatives Considered

| Instead of               | Could Use             | Tradeoff                                                       |
| ------------------------ | --------------------- | -------------------------------------------------------------- |
| Native fetch             | node:http             | Bun convention says use native fetch; node:http is lower-level |
| Custom circuit breaker   | opossum library       | Adding a dep for 50 lines of closure code isn't worth it       |
| Event bus (EventEmitter) | Direct function calls | CONTEXT.md explicitly deferred event bus pattern               |

**Installation:**

```bash
# No new dependencies needed -- all already in luca-framework/package.json
```

## Architecture Patterns

### Recommended File Placement

The emitter belongs inside `packages/luca-framework/src/emitter/` as a new directory. Rationale:

1. **Not in `src/` (build-layer domains)**: The `src/` root directory is for agent/skill/rule definitions that get compiled to markdown. The emitter is runtime TypeScript code, not a domain definition.
2. **Not in `packages/luca-observer/`**: The observer is a Next.js dashboard app. The emitter runs in the CLI framework -- different runtime, different package.
3. **In `packages/luca-framework/src/emitter/`**: This is runtime code consumed by the state machine bridge, hook scripts, and skills. It sits alongside `state/`, `utils/`, and `commands/`.

```
packages/luca-framework/src/
├── emitter/
│   ├── __schemas/
│   │   └── emitter.schemas.ts     # Zod schemas for engram payloads, config
│   ├── __helpers/
│   │   ├── circuit-breaker.ts     # Closure-based circuit breaker
│   │   ├── muninn-http.ts         # Low-level HTTP client for MuninnDB
│   │   ├── batch-queue.ts         # Timer-based batch accumulator
│   │   └── emit-functions.ts      # High-level emit*() convenience functions
│   └── index.ts                   # Barrel re-exports
├── state/                         # Existing state machine
├── utils/                         # Existing utilities
└── commands/                      # Existing CLI commands
```

### Pattern 1: Fire-and-Forget Emission

**What:** All emission calls are non-blocking. Callers use `void emitSessionStart(...)` -- never awaiting the result.
**When to use:** Every emission call site.
**Example:**

```typescript
// Source: CONTEXT.md decision + existing bridge.ts pattern (appendLedgerEntry uses .catch())
//
// In bridge.ts handleTransition():
// Emit phase transition to MuninnDB (fire-and-forget)
void emitStateTransition({
  previous_state: String(prevState),
  current_state: String(nextSnapshot.value),
  event_type: eventType,
  session_id: nextSnapshot.context.session_id,
});
```

### Pattern 2: Closure-Based Circuit Breaker

**What:** Factory function returning an object with `execute()`, `getState()`, and `reset()` methods. Uses closures for state (no classes per project rules).
**When to use:** Wraps all MuninnDB HTTP calls.
**Example:**

```typescript
// Source: CONTEXT.md decision, project no-classes rule
function createCircuitBreaker(config: CircuitBreakerConfig) {
  let failures = 0;
  let state: "closed" | "open" | "half-open" = "closed";
  let lastFailureTime = 0;

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T | null> {
      if (state === "open") {
        if (Date.now() - lastFailureTime >= config.reset_timeout_ms) {
          state = "half-open";
        } else {
          return null; // Circuit open, skip
        }
      }
      try {
        const result = await fn();
        // Success: reset on closed, close on half-open
        failures = 0;
        state = "closed";
        return result;
      } catch {
        failures++;
        lastFailureTime = Date.now();
        if (failures >= config.max_failures) {
          state = "open";
        }
        return null;
      }
    },
    getState: () => ({ state, failures }),
    reset: () => {
      failures = 0;
      state = "closed";
    },
  };
}
```

### Pattern 3: Timer-Based Batch Queue

**What:** Accumulates engrams in an array, flushes on timer (2s) or threshold (10 items). Since MuninnDB REST API has no batch endpoint, flush sends individual `POST /api/engrams` calls.
**When to use:** All emissions go through the queue.
**Example:**

```typescript
// Source: CONTEXT.md batching decision
function createBatchQueue(config: BatchQueueConfig) {
  const queue: EmissionEngram[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (queue.length === 0) return;
    const batch = queue.splice(0);
    // Send each engram individually (no batch REST endpoint)
    await Promise.allSettled(batch.map((engram) => config.send(engram)));
  };

  const scheduleFlush = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, config.flush_interval_ms);
  };

  return {
    enqueue: (engram: EmissionEngram) => {
      queue.push(engram);
      if (queue.length >= config.threshold) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        void flush();
      } else {
        scheduleFlush();
      }
    },
    flush, // Force flush (used on session end)
    size: () => queue.length,
  };
}
```

### Pattern 4: Singleton Emitter with Lazy Init

**What:** Module-level singleton created on first use. Reads `MUNINN_DB_URL` and `MUNINN_DB_API_KEY` from environment (Bun auto-loads .env).
**When to use:** All callers import from the barrel `emitter/index.ts`.
**Example:**

```typescript
// Source: packages/luca-observer/lib/muninn-config.ts (existing singleton pattern)
let _emitter: EmitterInstance | null = null;

function getEmitter(): EmitterInstance {
  if (!_emitter) {
    _emitter = createEmitter({
      base_url: process.env.MUNINN_DB_URL ?? "http://127.0.0.1:8476",
      api_key: process.env.MUNINN_DB_API_KEY ?? "",
      vault: "default",
      circuit_breaker: {
        max_failures: 5,
        reset_timeout_ms: 30_000,
        half_open_max: 1,
      },
      batch: { flush_interval_ms: 2_000, threshold: 10 },
    });
  }
  return _emitter;
}
```

### Anti-Patterns to Avoid

- **Importing from luca-observer**: The observer is a separate Next.js package. Never import from `packages/luca-observer/` into `packages/luca-framework/`. Copy the HTTP client pattern, not the code.
- **Using MCP tools in TypeScript code**: MCP tools (`muninn_remember`) are only available to Claude Code agents via protocol. Framework TypeScript code MUST use the HTTP API directly.
- **Awaiting emissions in hot paths**: Emissions are fire-and-forget. Never `await emit*()` in the bridge transition handler or hook scripts.
- **Using classes for circuit breaker or queue**: Project rules prohibit classes. Use factory functions with closures.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem              | Don't Build              | Use Instead                   | Why                                                     |
| -------------------- | ------------------------ | ----------------------------- | ------------------------------------------------------- |
| JSON validation      | Manual if/typeof checks  | Zod schemas with safeParse    | Project convention, single source of truth for defaults |
| HTTP timeout         | Manual setTimeout/race   | AbortController with timeout  | Existing pattern in muninn-config.ts                    |
| Safe property access | Optional chaining chains | lodash `get()`                | Project convention                                      |
| UUID generation      | Custom ID generator      | `crypto.randomUUID()`         | Already used in state machine context                   |
| Timestamp formatting | Custom date formatting   | `new Date().toISOString()`    | Already used everywhere in state machine                |
| Logging              | console.log/error        | consola via `utils/logger.ts` | Existing logger module                                  |

**Key insight:** The existing `muninn-config.ts` HTTP client pattern (singleton, AbortController timeout, Bearer auth) is exactly what the emitter needs. Replicate the pattern, don't import it cross-package.

## Common Pitfalls

### Pitfall 1: Wrong API Endpoint Name

**What goes wrong:** CONTEXT.md states `POST /api/remember` and `POST /api/remember_batch` but these are MCP tool names, not REST endpoints.
**Why it happens:** Confusion between MuninnDB MCP tools (used by Claude agents) and the REST API (used by TypeScript code).
**How to avoid:** Use `POST /api/engrams` for single writes. There is no batch REST endpoint -- the MCP `remember_batch` tool likely sends multiple individual HTTP requests internally.
**Warning signs:** 404 responses from MuninnDB when calling `/api/remember`.

### Pitfall 2: Cross-Package Import from Observer

**What goes wrong:** Importing `getMuninnClient()` from `packages/luca-observer/lib/muninn-config.ts` into the framework.
**Why it happens:** The HTTP client code already exists there, tempting direct import.
**How to avoid:** The observer is a Next.js app with its own dependencies (React, Next.js). The framework is a CLI package. They are separate packages with no workspace dependency. Create a framework-local HTTP client.
**Warning signs:** TypeScript compile errors about missing React/Next.js types.

### Pitfall 3: Blocking Emission in Hook Scripts

**What goes wrong:** Session hooks (session-start.sh, session-persist.sh) have strict timeouts (10-15s). If emission blocks or retries, the hook times out.
**Why it happens:** Calling emitter functions synchronously in shell scripts via `bun -e`.
**How to avoid:** In hook scripts, emission must be truly fire-and-forget: spawn the bun process, don't wait for HTTP response. Alternatively, hook scripts can enqueue to a local file and let the framework flush later.
**Warning signs:** Hook timeout warnings, session start taking >5 seconds.

### Pitfall 4: Tight Coupling to State Machine

**What goes wrong:** Emitter module importing deeply from `state/` internals, creating circular dependencies.
**Why it happens:** Emitter needs context from state (session_id, complexity, phase, milestone).
**How to avoid:** Pass context data as function parameters, not by importing state module internals. The emitter should accept plain data objects, not reach into the state machine.
**Warning signs:** Circular import errors, TypeScript "cannot find module" during type checking.

### Pitfall 5: MuninnDB Not Running

**What goes wrong:** In development or CI, MuninnDB may not be running. Emissions silently fail but circuit breaker opens after 5 failures, preventing any future emissions for 30 seconds.
**Why it happens:** MuninnDB is a local service, not always running.
**How to avoid:** This is expected behavior. The circuit breaker correctly handles this. Log at debug level when circuit opens. Never throw errors from emission failures.
**Warning signs:** Debug logs showing "circuit open" -- this is fine, not an error.

## Code Examples

### MuninnDB REST API: Write an Engram

```typescript
// Source: MuninnDB REST API docs (https://muninndb.com/docs/api/rest)
// Verified against packages/luca-observer/lib/muninn-config.ts pattern

const MUNINN_BASE_URL = process.env.MUNINN_DB_URL ?? "http://127.0.0.1:8476";
const MUNINN_API_KEY = process.env.MUNINN_DB_API_KEY ?? "";
const MUNINN_TIMEOUT = 5_000; // 5s for emission (shorter than observer's 10s)

async function writeEngram(engram: {
  vault: string;
  concept: string;
  content: string;
  tags?: string[];
  confidence?: number;
}): Promise<{ id: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MUNINN_TIMEOUT);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (MUNINN_API_KEY) {
      headers["Authorization"] = `Bearer ${MUNINN_API_KEY}`;
    }

    const res = await fetch(`${MUNINN_BASE_URL}/api/engrams`, {
      method: "POST",
      headers,
      body: JSON.stringify(engram),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
```

### Engram Content Structure (per CONTEXT.md)

```typescript
// Source: 01-CONTEXT.md Gray Area 4
const engram = {
  vault: "default",
  concept: "emit:phase:complete",
  content: JSON.stringify({
    event_type: "phase:complete",
    timestamp: new Date().toISOString(),
    session_id: "fc759ad3-...",
    data: {
      phase_id: 1,
      summary: "MuninnDB emission layer implemented",
      status: "passed",
    },
    metadata: {
      milestone: "v3.2.0",
      phase: 1,
      complexity: "COMPLEX",
      branch: "59--v3.2-observer-rebirth",
    },
  }),
  tags: ["session:fc759ad3", "phase:1", "milestone:v3.2.0", "lifecycle"],
  confidence: 1.0,
};
```

### Integration Point: Bridge Transition Handler

```typescript
// Source: packages/luca-framework/src/state/bridge.ts handleTransition() line 618
// The existing fire-and-forget pattern for ledger:
appendLedgerEntry(record).catch((err) => {
  console.error("[bridge] Failed to append ledger entry:", err);
});

// New emission follows the same pattern:
void emitStateTransition({
  previous_state: String(prevState),
  current_state: String(nextSnapshot.value),
  event_type: eventType,
  session_id: nextSnapshot.context.session_id,
  metadata: {
    milestone: nextSnapshot.context.current_milestone,
    phase: nextSnapshot.context.current_phase,
    complexity: nextSnapshot.context.complexity,
  },
});
```

## Integration Points

### Where Emissions Should Be Triggered

Based on CONTEXT.md decisions and codebase analysis:

| Trigger              | File                                          | Location                          | How                                                       |
| -------------------- | --------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| Session start        | `src/hooks/scripts/session-start.sh`          | After state init (line ~157)      | `bun -e "import ... ; void emitSessionStart(...)"`        |
| Session end          | `src/hooks/scripts/session-persist.sh`        | Before exit (line ~91)            | `bun -e "import ... ; await flushAndEmitSessionEnd(...)"` |
| State transition     | `packages/luca-framework/src/state/bridge.ts` | `handleTransition()` (line ~618)  | Import emitter, `void emit(...)`                          |
| Field set            | `packages/luca-framework/src/state/bridge.ts` | `handleSetField()` (line ~531)    | Import emitter, `void emit(...)`                          |
| Phase suspend        | `packages/luca-framework/src/state/bridge.ts` | `handleSuspend()` (line ~843)     | Import emitter, `void emit(...)`                          |
| Phase resume         | `packages/luca-framework/src/state/bridge.ts` | `handleResumePhase()` (line ~937) | Import emitter, `void emit(...)`                          |
| Agent spawn/complete | Skills (autopilot, phase-execute)             | MCP context (not TypeScript)      | Via hook scripts or bridge commands                       |

### Bridge Integration Strategy

The bridge (`bridge.ts`) is the primary integration point because it handles ALL state transitions. Adding emission calls here ensures every transition is captured without modifying individual skills/agents.

The bridge already follows the fire-and-forget pattern with `appendLedgerEntry(record).catch(...)`. Emission calls will follow the identical pattern.

### Hook Script Integration Strategy

Hook scripts cannot import TypeScript modules directly. Two options:

1. **Inline bun -e**: Execute a small bun script that imports and calls the emitter
2. **Bridge subcommand**: Add `emit-event` subcommand to bridge.ts (already documented in state-machine-bridge.md rule as planned)

Option 2 (bridge subcommand) is preferred because:

- Consistent with existing hook-to-framework communication pattern (`run_bridge` function in common.sh)
- Single point of configuration (emitter config lives in the framework)
- Testable independently

## Schemas to Create

### Emission Engram Schema

```typescript
// emitter/__schemas/emitter.schemas.ts
import { z } from "zod";

export const emissionEngramSchema = z.object({
  vault: z.string().default("default"),
  concept: z.string(), // "emit:{category}:{event}"
  content: z.string(), // JSON-stringified event payload
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1.0),
});

export const emissionEventSchema = z.object({
  event_type: z.string(),
  timestamp: z.string(),
  session_id: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
  metadata: z
    .object({
      milestone: z.string().optional(),
      phase: z.number().int().optional(),
      complexity: z.string().optional(),
      branch: z.string().optional(),
    })
    .default({}),
});

export const circuitBreakerConfigSchema = z.object({
  max_failures: z.number().int().positive().default(5),
  reset_timeout_ms: z.number().int().positive().default(30_000),
  half_open_max: z.number().int().positive().default(1),
});

export const batchQueueConfigSchema = z.object({
  flush_interval_ms: z.number().int().positive().default(2_000),
  threshold: z.number().int().positive().default(10),
});

export const emitterConfigSchema = z.object({
  base_url: z.string().default("http://127.0.0.1:8476"),
  api_key: z.string().default(""),
  vault: z.string().default("default"),
  timeout_ms: z.number().int().positive().default(5_000),
  circuit_breaker: circuitBreakerConfigSchema.default({}),
  batch: batchQueueConfigSchema.default({}),
});
```

## State of the Art

| Old Approach               | Current Approach          | When Changed     | Impact                                 |
| -------------------------- | ------------------------- | ---------------- | -------------------------------------- |
| SpacetimeDB reducer calls  | Removed (v3.1.0)          | 2026-03-08       | No emission layer exists currently     |
| `observer-emitter.ts` file | Deleted in v3.1.0 cleanup | 2026-03-08       | Must build new emitter from scratch    |
| `@muninndb/client` SDK     | Does NOT exist on npm     | N/A              | Must use HTTP API directly             |
| `POST /api/remember`       | `POST /api/engrams`       | Current REST API | CONTEXT.md has incorrect endpoint name |

**Deprecated/outdated:**

- SpacetimeDB: Fully removed from framework in v3.1.0
- `observer-emitter.ts`: Deleted, was SpacetimeDB-specific
- `@muninndb/client` npm package: Does not exist; never use

## Open Questions

1. **Batch endpoint availability**
   - What we know: MuninnDB REST API docs show only `POST /api/engrams` (single). No batch endpoint documented.
   - What's unclear: Whether the MCP `remember_batch` tool has a corresponding REST endpoint not in the public docs, or if it sends individual requests internally.
   - Recommendation: Implement batching as multiple individual `POST /api/engrams` calls wrapped in `Promise.allSettled()`. If a batch REST endpoint is discovered later, swap the implementation.

2. **Hook script emission latency**
   - What we know: `session-persist.sh` has a 10-second timeout. Session-start has 15 seconds.
   - What's unclear: Whether `bun -e` cold-start + HTTP request + MuninnDB processing fits within these timeouts.
   - Recommendation: Use the bridge subcommand pattern (`run_bridge emit-event --type=session:start`). If timeout is a concern, spawn `bun` in background with `&` in the hook script (session end already uses this pattern for non-critical work).

3. **Vault naming for emissions**
   - What we know: Existing MuninnDB usage in the project uses vault "default" everywhere.
   - What's unclear: Whether emission engrams should go to "default" vault or a separate "luca-events" vault.
   - Recommendation: Use "default" vault (matches existing patterns, keeps engrams discoverable alongside other memories). Tag-based filtering (`lifecycle`, `decision`, `agent`, etc.) provides sufficient scoping.

## Sources

### Primary (HIGH confidence)

- `packages/luca-observer/lib/muninn-config.ts` — Existing HTTP client pattern, endpoint paths, auth pattern
- `packages/luca-observer/lib/muninn-types.ts` — MuninnEngram type definition
- `packages/luca-observer/lib/muninn-schemas.ts` — Zod schema patterns for MuninnDB
- `packages/luca-framework/src/state/bridge.ts` — Integration target, fire-and-forget pattern
- `packages/luca-framework/src/state/ledger.ts` — Append-only pattern, existing fire-and-forget usage
- `packages/luca-framework/src/state/types.ts` — WorkflowContext schema (fields available for metadata)
- `packages/luca-framework/src/state/events.ts` — TransitionRecord, ContextSummary patterns
- `src/hooks/scripts/session-start.sh` — Hook integration point, `run_bridge` pattern
- `src/hooks/scripts/session-persist.sh` — Session end integration point
- `src/hooks/scripts/_lib/common.sh` — `run_bridge()`, `read_session_id()` patterns
- `.planning/phases/01-muninndb-emission-layer/01-CONTEXT.md` — Locked decisions

### Secondary (MEDIUM confidence)

- [MuninnDB REST API docs](https://muninndb.com/docs/api/rest) — Confirmed `POST /api/engrams` endpoint, base URL prefix `/api/`, Bearer auth requirement
- `.planning/todos/pending/77-build-muninndb-emission-layer.md` — Requirements and audit findings

### Tertiary (LOW confidence)

- MuninnDB batch endpoint existence: Only documented in MCP tools, not REST API. Assumed individual requests for now.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All dependencies already in package.json, patterns verified from existing code
- Architecture: HIGH - File placement follows established package structure, integration points verified in source code
- API contract: HIGH - Verified against official REST docs AND existing observer code (both confirm `/api/engrams`)
- Pitfalls: HIGH - Based on actual code analysis (cross-package imports, endpoint naming, hook timeouts)
- Batch endpoint: LOW - REST API docs don't document it; MCP tools suggest it exists but may be MCP-level abstraction

**Critical correction from research:**
The CONTEXT.md states `POST /api/remember` and `POST /api/remember_batch` as the HTTP endpoints. This is INCORRECT. The actual REST API endpoint is `POST /api/engrams`. The `remember` and `remember_batch` names are MCP tool names, not REST endpoints. The planner MUST use `POST /api/engrams` in all task descriptions.

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (30 days - stable domain, local service)
