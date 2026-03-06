import { schema, table, t } from "spacetimedb/server";
import { CleanupSchedule } from "./cleanup-schedule";

// ─── Core Tables ───────────────────────────────────────────────

/**
 * Singleton table (id=1). XState workflow state snapshot.
 *
 * Enforced by reducer `update_workflow_state` which always uses
 * `id.find(1n)` + update/insert with `id: 1n`. The primary key
 * guarantees uniqueness — no second row with id=1 can exist.
 */
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
    sequenceNumber: t.u64(),
  },
);

/**
 * Singleton table (id=1). Latest harness run results.
 *
 * Enforced by reducer `update_harness_result` which always uses
 * `id.find(1n)` + update/insert with `id: 1n`. The primary key
 * guarantees uniqueness — no second row with id=1 can exist.
 */
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

/**
 * Singleton table (id=1). Full session plan JSON.
 *
 * Enforced by reducer `update_session_plan` which always uses
 * `id.find(1n)` + update/insert with `id: 1n`. The primary key
 * guarantees uniqueness — no second row with id=1 can exist.
 */
export const SessionPlans = table(
  { name: "session_plans", public: true },
  {
    id: t.u64().primaryKey(),
    planJson: t.string(),
    timestamp: t.u64(),
  },
);

/**
 * Singleton table (id=1). Full tribunal result JSON.
 *
 * Enforced by reducer `update_tribunal_result` which always uses
 * `id.find(1n)` + update/insert with `id: 1n`. The primary key
 * guarantees uniqueness — no second row with id=1 can exist.
 */
export const TribunalResults = table(
  { name: "tribunal_results", public: true },
  {
    id: t.u64().primaryKey(),
    resultJson: t.string(),
    timestamp: t.u64(),
  },
);

/**
 * Singleton table (id=1). BRAIN/MEMORY/WORKING/PROCEDURES file contents.
 *
 * Enforced by reducer `update_memory_files` which always uses
 * `id.find(1n)` + update/insert with `id: 1n`. The primary key
 * guarantees uniqueness — no second row with id=1 can exist.
 */
export const MemoryFiles = table(
  { name: "memory_files", public: true },
  {
    id: t.u64().primaryKey(),
    brainJson: t.string(),
    memoryJson: t.string(),
    workingJson: t.string(),
    proceduresJson: t.string(),
    timestamp: t.u64(),
  },
);

/**
 * Singleton table (id=1). Aggregated metrics snapshot.
 *
 * Enforced by reducer `update_metrics` which always uses
 * `id.find(1n)` + update/insert with `id: 1n`. The primary key
 * guarantees uniqueness — no second row with id=1 can exist.
 */
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

/**
 * Singleton table (id=1). Full workflow config JSON.
 *
 * Enforced by reducer `update_workflow_config` which always uses
 * `id.find(1n)` + update/insert with `id: 1n`. The primary key
 * guarantees uniqueness — no second row with id=1 can exist.
 */
export const WorkflowConfig = table(
  { name: "workflow_config", public: true },
  {
    id: t.u64().primaryKey(),
    configJson: t.string(),
  },
);

/** Suspend checkpoint data per phase. */
export const SuspendCheckpoints = table(
  {
    name: "suspend_checkpoints",
    public: true,
    indexes: [
      {
        accessor: "suspend_checkpoints_phase_id",
        name: "suspend_checkpoints_phase_id",
        algorithm: "btree" as const,
        columns: ["phaseId"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    phaseId: t.string(),
    checkpointJson: t.string(),
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

// ─── Audit Findings ──────────────────────────────────────────

/** Review agent findings persistence. */
export const AuditFindings = table(
  {
    name: "audit_findings",
    public: true,
    indexes: [
      {
        name: "audit_findings_session_id",
        algorithm: "btree" as const,
        columns: ["sessionId"],
      },
      {
        name: "audit_findings_file_path",
        algorithm: "btree" as const,
        columns: ["filePath"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.string(),
    phase: t.string(),
    sourceAgent: t.string(),
    severity: t.string(),
    category: t.string(),
    filePath: t.string(),
    lineStart: t.u64(),
    lineEnd: t.u64(),
    finding: t.string(),
    suggestedFix: t.string(),
    contextSnippet: t.string(),
    status: t.string(),
    resolutionNotes: t.string(),
    createdAt: t.u64(),
    resolvedAt: t.u64(),
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
  workflowConfig: WorkflowConfig,
  suspendCheckpoints: SuspendCheckpoints,
  toolCalls: ToolCalls,
  tokenUsage: TokenUsage,
  costTracking: CostTracking,
  contextSnapshots: ContextSnapshots,
  decisionLogs: DecisionLogs,
  auditFindings: AuditFindings,
  cleanupSchedule: CleanupSchedule,
});

export default spacetimedb;
