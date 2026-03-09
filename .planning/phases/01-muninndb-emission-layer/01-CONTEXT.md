# Phase 01 — MuninnDB Emission Layer: Context

## Gray Area 1: Integration Method

**Decision:** Use MuninnDB HTTP API directly (not MCP tools). [researched]

**Rationale:**

- The emission layer runs inside the luca-framework package (TypeScript, Bun runtime)
- MCP tools (`muninn_remember`, `muninn_remember_batch`) are only available to Claude Code agents via the MCP protocol — they cannot be called from regular TypeScript code
- The existing observer already has a working HTTP client pattern in `packages/luca-observer/lib/muninn-config.ts` (functional singleton, AbortController timeout)
- HTTP API works everywhere: framework code, hook scripts, skills, agents
- MuninnDB REST API endpoints for writing:
  - `POST /api/remember` — single engram
  - `POST /api/remember_batch` — batch of engrams (preferred for efficiency)

**Locked:** HTTP API. MCP tools remain for agent-level memory operations (brain tree recall, session recall).

## Gray Area 2: Emission Trigger Points

**Decision:** Emit at these lifecycle boundaries. [user-input]

| Trigger              | Event Type                                     | Source                                   |
| -------------------- | ---------------------------------------------- | ---------------------------------------- |
| Session start        | `session:start`                                | Hook scripts (session-start.sh)          |
| Session end          | `session:end`                                  | Hook scripts (session-persist.sh)        |
| Phase transition     | `phase:start`, `phase:complete`, `phase:fail`  | State machine bridge (transition events) |
| Agent spawn/complete | `agent:spawn`, `agent:complete`, `agent:error` | Skills (phase-execute, autopilot)        |
| Decision made        | `decision:made`                                | Planner, router, verifier                |
| Finding captured     | `finding:captured`                             | Learner, verifier                        |
| State change         | `state:transition`                             | Bridge transition handler                |

**Implementation:** The emitter module exposes pure functions (`emitSessionStart()`, `emitPhaseTransition()`, etc.) that callers invoke at the appropriate points. Not an event bus — explicit calls at known boundaries.

## Gray Area 3: Circuit Breaker & Resilience Pattern

**Decision:** Closure-based circuit breaker with conservative thresholds for local service. [researched]

**Pattern:** Functional circuit breaker using closures (no classes per project rules).

```
createCircuitBreaker({ maxFailures: 5, resetTimeoutMs: 30_000, halfOpenMax: 1 })
```

**Thresholds (local HTTP service):**

- `maxFailures`: 5 consecutive failures before opening circuit
- `resetTimeoutMs`: 30 seconds before attempting half-open
- `halfOpenMax`: 1 probe request in half-open state
- These are generous because MuninnDB is a local service (127.0.0.1) — failures indicate the service is down, not network issues

**Fire-and-forget:**

- All emissions are non-blocking: `void emitEngram(...)` — caller never awaits
- Failures are logged to stderr but never thrown
- Circuit breaker prevents flooding a down service with requests

**Batching:**

- Accumulate engrams in a memory queue, flush every 2 seconds or when queue reaches 10 items
- Use `POST /api/remember_batch` for flushes (single HTTP call for multiple engrams)
- On session end, force-flush remaining queue

## Gray Area 4: Engram Schema & Entity Conventions

**Decision:** Hierarchical concept IDs with structured JSON content. [researched]

**Concept ID pattern:** `emit:{category}:{event}` — e.g., `emit:session:start`, `emit:phase:complete`, `emit:agent:spawn`

**Content structure** (JSON string in engram content field):

```json
{
  "event_type": "phase:complete",
  "timestamp": "2026-03-09T02:30:00.000Z",
  "session_id": "fc759ad3-...",
  "data": {
    /* event-specific payload */
  },
  "metadata": {
    "milestone": "v3.2.0",
    "phase": 1,
    "complexity": "COMPLEX",
    "branch": "59--v3.2-observer-rebirth"
  }
}
```

**Tag taxonomy:**

- Lifecycle: `session:<id>`, `phase:<N>`, `milestone:<version>`
- Category: `lifecycle`, `decision`, `finding`, `error`, `agent`
- Severity: `info`, `warning`, `error` (only when relevant)

**Entity conventions:**

- Session entities: `session:<session-id>`
- Agent entities: `agent:<agent-name>` (e.g., `agent:lu-executor`)
- Phase entities: `phase:<milestone>:<number>` (e.g., `phase:v3.2.0:01`)

**Target volume:** ~50-100 engrams per session (moderate granularity — not every tool call, but every meaningful lifecycle event).

## Deferred Ideas

- **Event bus pattern**: Could add pub/sub later if multiple consumers need emission events. Not needed now — single emitter, single destination.
- **Emission replay**: Could replay emissions for debugging. Defer to Phase 03 (API layer).
- **Real-time streaming**: WebSocket emission for live observer dashboard. Defer to later milestone.

---

_Context gathered: 2026-03-09 (auto-discuss, Phase 01)_
