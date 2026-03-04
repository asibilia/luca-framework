import spacetimedb from "./schema";
export default spacetimedb;
import { t, SenderError } from "spacetimedb/server";

// ─── Lifecycle Hooks ───────────────────────────────────────────

export const init = spacetimedb.init((_ctx) => {
  // Called when the module is initially published
});

export const onConnect = spacetimedb.clientConnected((_ctx) => {
  // Called every time a new client connects
});

export const onDisconnect = spacetimedb.clientDisconnected((_ctx) => {
  // Called every time a client disconnects
});

// ─── Core Reducers ─────────────────────────────────────────────

/**
 * Ingest an observer event.
 * Appends to observer_events and upserts the sessions table.
 */
export const ingest_event = spacetimedb.reducer(
  {
    eventType: t.string(),
    sessionId: t.string(),
    agentName: t.string(),
    toolName: t.string(),
    filePath: t.string(),
    durationMs: t.u64(),
    eventData: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    // Append event
    ctx.db.observerEvents.insert({
      id: 0n,
      eventType: args.eventType,
      sessionId: args.sessionId,
      agentName: args.agentName,
      toolName: args.toolName,
      filePath: args.filePath,
      durationMs: args.durationMs,
      eventData: args.eventData,
      timestamp: args.timestamp,
    });

    // Upsert session
    const existing = ctx.db.sessions.sessionId.find(args.sessionId);
    if (existing) {
      ctx.db.sessions.sessionId.update({
        ...existing,
        lastEventTime: args.timestamp,
        eventCount: existing.eventCount + 1n,
        status: "active",
      });
    } else {
      ctx.db.sessions.insert({
        sessionId: args.sessionId,
        status: "active",
        startTime: args.timestamp,
        lastEventTime: args.timestamp,
        eventCount: 1n,
        complexity: "",
        ticketId: "",
      });
    }
  },
);

/** Update the singleton workflow state (id=1). Creates if missing. */
export const update_workflow_state = spacetimedb.reducer(
  {
    workflowState: t.string(),
    currentPhase: t.string(),
    complexity: t.string(),
    oversight: t.string(),
    sessionId: t.string(),
    ticketId: t.string(),
    contextJson: t.string(),
  },
  (ctx, args) => {
    const existing = ctx.db.workflowState.id.find(1n);
    if (existing) {
      ctx.db.workflowState.id.update({
        ...existing,
        workflowState: args.workflowState,
        currentPhase: args.currentPhase,
        complexity: args.complexity,
        oversight: args.oversight,
        sessionId: args.sessionId,
        ticketId: args.ticketId,
        contextJson: args.contextJson,
      });
    } else {
      ctx.db.workflowState.insert({
        id: 1n,
        workflowState: args.workflowState,
        currentPhase: args.currentPhase,
        complexity: args.complexity,
        oversight: args.oversight,
        sessionId: args.sessionId,
        ticketId: args.ticketId,
        contextJson: args.contextJson,
      });
    }
  },
);

/** Update the singleton harness result (id=1). Creates if missing. */
export const update_harness_result = spacetimedb.reducer(
  {
    passed: t.bool(),
    totalErrors: t.u64(),
    totalWarnings: t.u64(),
    checksJson: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const existing = ctx.db.harnessResults.id.find(1n);
    if (existing) {
      ctx.db.harnessResults.id.update({
        ...existing,
        passed: args.passed,
        totalErrors: args.totalErrors,
        totalWarnings: args.totalWarnings,
        checksJson: args.checksJson,
        timestamp: args.timestamp,
      });
    } else {
      ctx.db.harnessResults.insert({
        id: 1n,
        passed: args.passed,
        totalErrors: args.totalErrors,
        totalWarnings: args.totalWarnings,
        checksJson: args.checksJson,
        timestamp: args.timestamp,
      });
    }
  },
);

/** Append a ledger entry. */
export const append_ledger_entry = spacetimedb.reducer(
  {
    sessionId: t.string(),
    phase: t.string(),
    plan: t.string(),
    action: t.string(),
    result: t.string(),
    timestamp: t.u64(),
    detailsJson: t.string(),
    sequenceNumber: t.u64(),
  },
  (ctx, args) => {
    ctx.db.ledgerEntries.insert({
      id: 0n,
      sessionId: args.sessionId,
      phase: args.phase,
      plan: args.plan,
      action: args.action,
      result: args.result,
      timestamp: args.timestamp,
      detailsJson: args.detailsJson,
      sequenceNumber: args.sequenceNumber,
    });
  },
);

/** Append an iteration record. */
export const append_iteration_record = spacetimedb.reducer(
  {
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
  (ctx, args) => {
    ctx.db.iterationRecords.insert({
      id: 0n,
      sessionId: args.sessionId,
      tag: args.tag,
      iteration: args.iteration,
      errorCount: args.errorCount,
      errorDelta: args.errorDelta,
      staleCount: args.staleCount,
      convergenceStatus: args.convergenceStatus,
      checkpointJson: args.checkpointJson,
      timestamp: args.timestamp,
    });
  },
);

/** Update the singleton session plan (id=1). Creates if missing. */
export const update_session_plan = spacetimedb.reducer(
  {
    planJson: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const existing = ctx.db.sessionPlans.id.find(1n);
    if (existing) {
      ctx.db.sessionPlans.id.update({
        ...existing,
        planJson: args.planJson,
        timestamp: args.timestamp,
      });
    } else {
      ctx.db.sessionPlans.insert({
        id: 1n,
        planJson: args.planJson,
        timestamp: args.timestamp,
      });
    }
  },
);

/** Update the singleton tribunal result (id=1). Creates if missing. */
export const update_tribunal_result = spacetimedb.reducer(
  {
    resultJson: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const existing = ctx.db.tribunalResults.id.find(1n);
    if (existing) {
      ctx.db.tribunalResults.id.update({
        ...existing,
        resultJson: args.resultJson,
        timestamp: args.timestamp,
      });
    } else {
      ctx.db.tribunalResults.insert({
        id: 1n,
        resultJson: args.resultJson,
        timestamp: args.timestamp,
      });
    }
  },
);

/** Update the singleton memory files (id=1). Creates if missing. */
export const update_memory_files = spacetimedb.reducer(
  {
    brainJson: t.string(),
    memoryJson: t.string(),
    workingJson: t.string(),
    proceduresJson: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const existing = ctx.db.memoryFiles.id.find(1n);
    if (existing) {
      ctx.db.memoryFiles.id.update({
        ...existing,
        brainJson: args.brainJson,
        memoryJson: args.memoryJson,
        workingJson: args.workingJson,
        proceduresJson: args.proceduresJson,
        timestamp: args.timestamp,
      });
    } else {
      ctx.db.memoryFiles.insert({
        id: 1n,
        brainJson: args.brainJson,
        memoryJson: args.memoryJson,
        workingJson: args.workingJson,
        proceduresJson: args.proceduresJson,
        timestamp: args.timestamp,
      });
    }
  },
);

/** Update the singleton metrics (id=1). Creates if missing. */
export const update_metrics = spacetimedb.reducer(
  {
    metricsJson: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const existing = ctx.db.metrics.id.find(1n);
    if (existing) {
      ctx.db.metrics.id.update({
        ...existing,
        metricsJson: args.metricsJson,
        timestamp: args.timestamp,
      });
    } else {
      ctx.db.metrics.insert({
        id: 1n,
        metricsJson: args.metricsJson,
        timestamp: args.timestamp,
      });
    }
  },
);

/** Create a new note. */
export const create_note = spacetimedb.reducer(
  {
    filename: t.string(),
    body: t.string(),
    priority: t.string(),
    createdAt: t.u64(),
  },
  (ctx, args) => {
    if (!args.filename) throw new SenderError("filename is required");
    ctx.db.notes.insert({
      id: 0n,
      filename: args.filename,
      body: args.body,
      priority: args.priority,
      status: "pending",
      createdAt: args.createdAt,
      consumedAt: undefined,
    });
  },
);

/** Mark a note as completed. */
export const complete_note = spacetimedb.reducer(
  {
    noteId: t.u64(),
    consumedAt: t.u64(),
  },
  (ctx, args) => {
    const note = ctx.db.notes.id.find(args.noteId);
    if (!note) throw new SenderError("Note not found");
    ctx.db.notes.id.update({
      ...note,
      status: "completed",
      consumedAt: args.consumedAt,
    });
  },
);

/** Update the singleton workflow config (id=1). Creates if missing. */
export const update_workflow_config = spacetimedb.reducer(
  {
    configJson: t.string(),
  },
  (ctx, args) => {
    const existing = ctx.db.workflowConfig.id.find(1n);
    if (existing) {
      ctx.db.workflowConfig.id.update({
        ...existing,
        configJson: args.configJson,
      });
    } else {
      ctx.db.workflowConfig.insert({
        id: 1n,
        configJson: args.configJson,
      });
    }
  },
);

/** Save a suspend checkpoint for a phase. Upserts by phaseId. */
export const save_checkpoint = spacetimedb.reducer(
  {
    phaseId: t.string(),
    checkpointJson: t.string(),
  },
  (ctx, args) => {
    if (!args.phaseId) throw new SenderError("phaseId is required");
    // Find existing checkpoint for this phase via index
    const existing = [
      ...ctx.db.suspendCheckpoints.suspend_checkpoints_phase_id.filter(
        args.phaseId,
      ),
    ];
    if (existing.length > 0) {
      ctx.db.suspendCheckpoints.id.update({
        ...existing[0],
        checkpointJson: args.checkpointJson,
      });
    } else {
      ctx.db.suspendCheckpoints.insert({
        id: 0n,
        phaseId: args.phaseId,
        checkpointJson: args.checkpointJson,
      });
    }
  },
);

/** Delete a suspend checkpoint by phaseId. */
export const delete_checkpoint = spacetimedb.reducer(
  {
    phaseId: t.string(),
  },
  (ctx, args) => {
    if (!args.phaseId) throw new SenderError("phaseId is required");
    const existing = [
      ...ctx.db.suspendCheckpoints.suspend_checkpoints_phase_id.filter(
        args.phaseId,
      ),
    ];
    for (const row of existing) {
      ctx.db.suspendCheckpoints.id.delete(row.id);
    }
  },
);

// ─── Observability Reducers ────────────────────────────────────

/** Log a tool call. */
export const log_tool_call = spacetimedb.reducer(
  {
    sessionId: t.string(),
    toolName: t.string(),
    durationMs: t.u64(),
    inputSize: t.u64(),
    outputSize: t.u64(),
    turnNumber: t.u64(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    ctx.db.toolCalls.insert({
      id: 0n,
      sessionId: args.sessionId,
      toolName: args.toolName,
      durationMs: args.durationMs,
      inputSize: args.inputSize,
      outputSize: args.outputSize,
      turnNumber: args.turnNumber,
      timestamp: args.timestamp,
    });
  },
);

/** Log token usage for a turn. */
export const log_token_usage = spacetimedb.reducer(
  {
    sessionId: t.string(),
    turnNumber: t.u64(),
    inputTokens: t.u64(),
    outputTokens: t.u64(),
    cacheReadTokens: t.u64(),
    cacheWriteTokens: t.u64(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    ctx.db.tokenUsage.insert({
      id: 0n,
      sessionId: args.sessionId,
      turnNumber: args.turnNumber,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cacheReadTokens: args.cacheReadTokens,
      cacheWriteTokens: args.cacheWriteTokens,
      timestamp: args.timestamp,
    });
  },
);

/** Upsert the cost tracking for a session. */
export const update_cost = spacetimedb.reducer(
  {
    sessionId: t.string(),
    inputCostCents: t.u64(),
    outputCostCents: t.u64(),
    totalCostCents: t.u64(),
    turnCount: t.u64(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const existing = ctx.db.costTracking.sessionId.find(args.sessionId);
    if (existing) {
      ctx.db.costTracking.sessionId.update({
        ...existing,
        inputCostCents: args.inputCostCents,
        outputCostCents: args.outputCostCents,
        totalCostCents: args.totalCostCents,
        turnCount: args.turnCount,
        timestamp: args.timestamp,
      });
    } else {
      ctx.db.costTracking.insert({
        sessionId: args.sessionId,
        inputCostCents: args.inputCostCents,
        outputCostCents: args.outputCostCents,
        totalCostCents: args.totalCostCents,
        turnCount: args.turnCount,
        timestamp: args.timestamp,
      });
    }
  },
);

/** Append a context-window snapshot. */
export const snapshot_context = spacetimedb.reducer(
  {
    sessionId: t.string(),
    contextPercent: t.u64(),
    messageCount: t.u64(),
    estimatedTokens: t.u64(),
    phase: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    ctx.db.contextSnapshots.insert({
      id: 0n,
      sessionId: args.sessionId,
      contextPercent: args.contextPercent,
      messageCount: args.messageCount,
      estimatedTokens: args.estimatedTokens,
      phase: args.phase,
      timestamp: args.timestamp,
    });
  },
);

/** Log a decision. */
export const log_decision = spacetimedb.reducer(
  {
    sessionId: t.string(),
    decisionType: t.string(),
    chosenApproach: t.string(),
    alternativesJson: t.string(),
    reasoning: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    ctx.db.decisionLogs.insert({
      id: 0n,
      sessionId: args.sessionId,
      decisionType: args.decisionType,
      chosenApproach: args.chosenApproach,
      alternativesJson: args.alternativesJson,
      reasoning: args.reasoning,
      timestamp: args.timestamp,
    });
  },
);

// ─── Export Placeholders ───────────────────────────────────────

/** Placeholder for JSON export. No-op for now. */
export const export_to_json = spacetimedb.reducer((_ctx) => {
  // Future: export all tables to JSON
});

/** Placeholder for Markdown export. No-op for now. */
export const export_to_md = spacetimedb.reducer((_ctx) => {
  // Future: export session summary to Markdown
});
