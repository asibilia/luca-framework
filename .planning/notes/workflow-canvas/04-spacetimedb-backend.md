# Workflow Canvas: SpacetimeDB v2 Backend Integration

> **Author:** Senior Backend Developer (AI agent)
> **Date:** 2026-03-26
> **Status:** Approved — SpacetimeDB v2 confirmed by founder as non-negotiable

---

## 1. Dual-Channel Architecture

| Channel                               | What it carries                                        | Why                                       |
| ------------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| SpacetimeDB subscriptions (WebSocket) | Run status, RunStep status, final outputs, cost totals | Persistent state that survives refresh    |
| SSE (`/api/runs/[id]/stream`)         | Streaming LLM tokens, progress events, budget warnings | Ephemeral real-time data during execution |

## 2. Revised CORS Architecture

Canvas CRUD goes direct via SpacetimeDB SDK from browser (WebSocket bypasses CORS). Only execution + key management need Next.js API routes.

```
Browser (SpacetimeDB SDK via WebSocket)
  |-- Direct: CRUD on workflows, nodes, edges (reducers)
  |-- Direct: Subscribe to run status, run steps (subscriptions)
  |-- Direct: Read workflow list, version history (subscriptions)

Browser (fetch to Next.js API routes)
  |-- /api/runs/ POST: Start execution (server holds API keys, calls providers)
  |-- /api/runs/[id]/stream GET: SSE for streaming tokens
  |-- /api/providers/ PUT: Save encrypted API key (server-side encryption)
  |-- /api/providers/ GET: List configured providers (keys masked)
```

## 3. Execution Engine + SpacetimeDB Flow

### Starting a Run

```
POST /api/runs/
  1. Validate graph (cycle detection, required ports)
  2. Snapshot workflow version (call createWorkflowVersion reducer)
  3. Call createRun reducer -> inserts Run row (status: "pending")
  4. For each node: call createRunStep reducer -> RunStep rows (status: "pending")
  5. Transition Run to "running" via updateRunStatus reducer
  6. Begin wave execution
  7. Return { run_id } to client immediately (202 Accepted)
```

### Wave Execution

```
For each wave:
  1. Per node: call updateRunStepStatus reducer (status: "running")
  2. Execute nodes via Promise.allSettled (Vercel AI SDK calls)
  3. Per completed: call completeRunStep reducer with output, tokens, cost_micros
  4. Per failed: call failRunStep reducer with error
  5. Emit SSE events to the client stream
  6. Check budget before next wave
  7. After final wave: call completeRun reducer
```

### Server-side Connection Singleton

```typescript
// lib/spacetimedb-server.ts
let connectionPromise: Promise<DbConnection> | null = null;

export function getServerConnection(): Promise<DbConnection> {
  if (!connectionPromise) {
    connectionPromise = DbConnection.builder()
      .withUri(process.env.SPACETIMEDB_URI ?? "http://localhost:3000")
      .withModuleName("luca-canvas")
      .withToken(process.env.SPACETIMEDB_TOKEN)
      .build();
  }
  return connectionPromise;
}
```

## 4. Streaming Output: SSE for Tokens, SpacetimeDB for Results

**Decision:** SSE for streaming, SpacetimeDB for final results only.

- streamText() via Vercel AI SDK produces token chunks
- Chunks piped directly to SSE stream (zero latency)
- On completion: final text + tokens + cost written to SpacetimeDB via reducer
- A 50-node workflow generates 50 reducer calls, not 10,000

## 5. API Key Security Flow

### Server-side encryption (MVP — Option A)

```
User enters key in UI
  → HTTPS POST to /api/providers/
  → Server encrypts with AES-256-GCM using ENCRYPTION_KEY env var
  → Encrypted blob stored in SpacetimeDB provider_config (public: false)
  → At execution time: server reads encrypted blob, decrypts, calls provider
  → Key never leaves server process
```

### Why not client-side encryption

Client-side encryption requires the user to enter a passphrase before every execution (the server can't decrypt without it). Bad UX for MVP. Server-side encryption with `ENCRYPTION_KEY` env var is the standard SaaS pattern.

## 6. Risk Mitigations (SpacetimeDB Confirmed)

### Maturity

- Repository abstraction (`WorkflowRepository` interface) for swappable backends
- Pin SDK at `2.0.2`, do not auto-update
- JSON export from day 1 as escape hatch
- SQLite fallback auto-activates when `SPACETIMEDB_URI` is not set
- Integration test suite against local SpacetimeDB before releases

### No JOINs

- Client-side joins on subscription cache (small data, fast in-memory)
- Denormalized `run_metrics` table (computed in reducers)
- Subscription filtering via WHERE clauses (indexed foreign keys)
- `sync_graph` bulk reducer avoids N individual reducer calls

### Schema Migrations

- Additive migrations via `spacetime publish --clear=false`
- Breaking changes: export → publish new module → re-import
- Phase 1 schema freeze: all Phase 1-3 schemas defined upfront
- Migration scripts in `packages/luca-studio-db/migrations/`

### Backup

- SpacetimeDB Cloud automatic snapshots
- Application-level JSON export
- Optional SQLite shadow writes for belt-and-suspenders

### Operational Complexity

- SpacetimeDB Cloud for production (managed, no ops)
- Docker Compose for local dev
- Graceful degradation: connection banner + read-only mode if SpacetimeDB unreachable
- Health check endpoint at `/api/health`

## Phase Deliverables

| Phase   | Backend Deliverables                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1 | SpacetimeDB module (tables + reducers), WorkflowRepository + SpacetimeDB impl, SQLite fallback, JSON export/import, server connection singleton  |
| Phase 2 | Execution engine (wave-based), SSE streaming, Run/RunStep reducers, provider integration (Vercel AI SDK), API key encryption, budget enforcement |
| Phase 3 | Loop execution, checkpoint/resume, debug breakpoints, workflow-as-node composition                                                               |
