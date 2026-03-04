import { schema, table, t } from "spacetimedb/server";

// ─── Core Tables ───────────────────────────────────────────────

/** Singleton (id=1). XState workflow state snapshot. */
export const WorkflowState = table(
  { name: "workflow_state", public: true },
  {
    id: t.u64().primaryKey(),
    workflowState: t.string(),
    currentPhase: t.string(),
    complexity: t.string(),
    oversight: t.string(),
    sessionId: t.string(),
    ticketId: t.string(),
    contextJson: t.string(),
  },
);

/** Append-only event stream. */
export const ObserverEvents = table(
  {
    name: "observer_events",
    public: true,
    indexes: [
      {
        name: "observer_events_session_id",
        algorithm: "btree" as const,
        columns: ["sessionId"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    eventType: t.string(),
    sessionId: t.string(),
    agentName: t.string(),
    toolName: t.string(),
    filePath: t.string(),
    durationMs: t.u64(),
    eventData: t.string(),
    timestamp: t.u64(),
  },
);

/** One row per session. Upserted by ingest_event. */
export const Sessions = table(
  { name: "sessions", public: true },
  {
    sessionId: t.string().primaryKey(),
    status: t.string(),
    startTime: t.u64(),
    lastEventTime: t.u64(),
    eventCount: t.u64(),
    complexity: t.string(),
    ticketId: t.string(),
  },
);

/** Phase/plan action ledger. */
export const LedgerEntries = table(
  {
    name: "ledger_entries",
    public: true,
    indexes: [
      {
        name: "ledger_entries_session_id",
        algorithm: "btree" as const,
        columns: ["sessionId"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.string(),
    phase: t.string(),
    plan: t.string(),
    action: t.string(),
    result: t.string(),
    timestamp: t.u64(),
    detailsJson: t.string(),
  },
);

/** Singleton (id=1). Latest harness run results. */
export const HarnessResults = table(
  { name: "harness_results", public: true },
  {
    id: t.u64().primaryKey(),
    passed: t.bool(),
    totalErrors: t.u64(),
    totalWarnings: t.u64(),
    checksJson: t.string(),
    timestamp: t.u64(),
  },
);

/** Convergence loop iterations. */
export const IterationRecords = table(
  {
    name: "iteration_records",
    public: true,
    indexes: [
      {
        name: "iteration_records_session_id",
        algorithm: "btree" as const,
        columns: ["sessionId"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.string(),
    tag: t.string(),
    iteration: t.u64(),
    errorCount: t.u64(),
    errorDelta: t.i64(),
    staleCount: t.u64(),
    convergenceStatus: t.string(),
    checkpointJson: t.string(),
    timestamp: t.u64(),
  },
);

/** Singleton (id=1). Full session plan JSON. */
export const SessionPlans = table(
  { name: "session_plans", public: true },
  {
    id: t.u64().primaryKey(),
    planJson: t.string(),
    timestamp: t.u64(),
  },
);

/** Singleton (id=1). Full tribunal result JSON. */
export const TribunalResults = table(
  { name: "tribunal_results", public: true },
  {
    id: t.u64().primaryKey(),
    resultJson: t.string(),
    timestamp: t.u64(),
  },
);

/** Singleton (id=1). BRAIN/MEMORY/WORKING file contents. */
export const MemoryFiles = table(
  { name: "memory_files", public: true },
  {
    id: t.u64().primaryKey(),
    brainJson: t.string(),
    memoryJson: t.string(),
    workingJson: t.string(),
    timestamp: t.u64(),
  },
);

/** Singleton (id=1). Aggregated metrics snapshot. */
export const Metrics = table(
  { name: "metrics", public: true },
  {
    id: t.u64().primaryKey(),
    metricsJson: t.string(),
    timestamp: t.u64(),
  },
);

/** Note inbox — append/complete workflow. */
export const Notes = table(
  { name: "notes", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    filename: t.string(),
    body: t.string(),
    priority: t.string(),
    status: t.string(),
    createdAt: t.u64(),
    consumedAt: t.u64().optional(),
  },
);

// ─── Observability Tables ──────────────────────────────────────

/** Per-tool-call telemetry. */
export const ToolCalls = table(
  {
    name: "tool_calls",
    public: true,
    indexes: [
      {
        name: "tool_calls_session_id",
        algorithm: "btree" as const,
        columns: ["sessionId"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.string(),
    toolName: t.string(),
    durationMs: t.u64(),
    inputSize: t.u64(),
    outputSize: t.u64(),
    turnNumber: t.u64(),
    timestamp: t.u64(),
  },
);

/** Per-turn token usage. */
export const TokenUsage = table(
  {
    name: "token_usage",
    public: true,
    indexes: [
      {
        name: "token_usage_session_id",
        algorithm: "btree" as const,
        columns: ["sessionId"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.string(),
    turnNumber: t.u64(),
    inputTokens: t.u64(),
    outputTokens: t.u64(),
    cacheReadTokens: t.u64(),
    cacheWriteTokens: t.u64(),
    timestamp: t.u64(),
  },
);

/** Per-session cost summary. */
export const CostTracking = table(
  { name: "cost_tracking", public: true },
  {
    sessionId: t.string().primaryKey(),
    inputCostCents: t.u64(),
    outputCostCents: t.u64(),
    totalCostCents: t.u64(),
    turnCount: t.u64(),
    timestamp: t.u64(),
  },
);

/** Context-window snapshots over time. */
export const ContextSnapshots = table(
  {
    name: "context_snapshots",
    public: true,
    indexes: [
      {
        name: "context_snapshots_session_id",
        algorithm: "btree" as const,
        columns: ["sessionId"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.string(),
    contextPercent: t.u64(),
    messageCount: t.u64(),
    estimatedTokens: t.u64(),
    phase: t.string(),
    timestamp: t.u64(),
  },
);

/** Decision audit trail. */
export const DecisionLogs = table(
  {
    name: "decision_logs",
    public: true,
    indexes: [
      {
        name: "decision_logs_session_id",
        algorithm: "btree" as const,
        columns: ["sessionId"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.string(),
    decisionType: t.string(),
    chosenApproach: t.string(),
    alternativesJson: t.string(),
    reasoning: t.string(),
    timestamp: t.u64(),
  },
);

// ─── Schema Export ─────────────────────────────────────────────

const spacetimedb = schema({
  workflowState: WorkflowState,
  observerEvents: ObserverEvents,
  sessions: Sessions,
  ledgerEntries: LedgerEntries,
  harnessResults: HarnessResults,
  iterationRecords: IterationRecords,
  sessionPlans: SessionPlans,
  tribunalResults: TribunalResults,
  memoryFiles: MemoryFiles,
  metrics: Metrics,
  notes: Notes,
  toolCalls: ToolCalls,
  tokenUsage: TokenUsage,
  costTracking: CostTracking,
  contextSnapshots: ContextSnapshots,
  decisionLogs: DecisionLogs,
});

export default spacetimedb;
