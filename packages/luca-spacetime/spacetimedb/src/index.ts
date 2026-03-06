import spacetimedb from "./schema";
export default spacetimedb;
import { t, SenderError } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import { CleanupSchedule, reducerRef } from "./cleanup-schedule";

// ─── Lifecycle Hooks ───────────────────────────────────────────

export const init = spacetimedb.init((ctx) => {
  // Seed the first TTL cleanup job (runs 1 hour after module publish)
  const MICROS_PER_HOUR = 3_600_000_000n;
  const firstRun = ctx.timestamp.microsSinceUnixEpoch + MICROS_PER_HOUR;
  ctx.db.cleanupSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(firstRun),
    eventsMaxAgeHours: 24n,
    usageMaxAgeHours: 168n,
    preserveCount: 1000n,
  });
});

export const onConnect = spacetimedb.clientConnected((ctx) => {
  // Safety check: if the cleanup schedule chain broke, re-seed it
  const scheduleRows = [...ctx.db.cleanupSchedule.iter()];
  if (scheduleRows.length === 0) {
    const MICROS_PER_HOUR = 3_600_000_000n;
    const firstRun = ctx.timestamp.microsSinceUnixEpoch + MICROS_PER_HOUR;
    ctx.db.cleanupSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(firstRun),
      eventsMaxAgeHours: 24n,
      usageMaxAgeHours: 168n,
      preserveCount: 1000n,
    });
  }
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
    if (!args.sessionId) throw new SenderError("sessionId is required");

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

/**
 * Upsert the singleton workflow state (id=1).
 * Singleton contract: always targets id=1n. PK uniqueness prevents duplicates.
 */
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
    const VALID_COMPLEXITIES = [
      "TRIVIAL",
      "SIMPLE",
      "MODERATE",
      "COMPLEX",
      "CRITICAL",
    ];
    if (!VALID_COMPLEXITIES.includes(args.complexity)) {
      throw new SenderError(
        `Invalid complexity: must be one of ${VALID_COMPLEXITIES.join(", ")}`,
      );
    }

    const SINGLETON_ID = 1n;
    const row = {
      id: SINGLETON_ID,
      workflowState: args.workflowState,
      currentPhase: args.currentPhase,
      complexity: args.complexity,
      oversight: args.oversight,
      sessionId: args.sessionId,
      ticketId: args.ticketId,
      contextJson: args.contextJson,
    };
    const existing = ctx.db.workflowState.id.find(SINGLETON_ID);
    if (existing) {
      ctx.db.workflowState.id.update({ ...existing, ...row });
    } else {
      ctx.db.workflowState.insert(row);
    }
  },
);

/**
 * Upsert the singleton harness result (id=1).
 * Singleton contract: always targets id=1n. PK uniqueness prevents duplicates.
 */
export const update_harness_result = spacetimedb.reducer(
  {
    passed: t.bool(),
    totalErrors: t.u64(),
    totalWarnings: t.u64(),
    checksJson: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const SINGLETON_ID = 1n;
    const row = {
      id: SINGLETON_ID,
      passed: args.passed,
      totalErrors: args.totalErrors,
      totalWarnings: args.totalWarnings,
      checksJson: args.checksJson,
      timestamp: args.timestamp,
    };
    const existing = ctx.db.harnessResults.id.find(SINGLETON_ID);
    if (existing) {
      ctx.db.harnessResults.id.update({ ...existing, ...row });
    } else {
      ctx.db.harnessResults.insert(row);
    }
  },
);

/**
 * Append a ledger entry.
 *
 * sequenceNumber is computed server-side (max + 1 for the session) to
 * prevent race conditions under concurrent writes. Reducers are
 * transactional, so this is atomic.
 */
export const append_ledger_entry = spacetimedb.reducer(
  {
    sessionId: t.string(),
    phase: t.string(),
    plan: t.string(),
    action: t.string(),
    result: t.string(),
    timestamp: t.u64(),
    detailsJson: t.string(),
  },
  (ctx, args) => {
    if (!args.sessionId) throw new SenderError("sessionId is required");

    // Compute next sequence number atomically inside the reducer.
    // SpacetimeDB multi-column unique constraints are not supported,
    // so uniqueness of (sessionId, sequenceNumber) is enforced here
    // by the transactional nature of reducers.
    const sessionEntries = [
      ...ctx.db.ledgerEntries.ledger_entries_session_id.filter(args.sessionId),
    ];
    let maxSeq = -1n;
    for (const entry of sessionEntries) {
      if (entry.sequenceNumber > maxSeq) {
        maxSeq = entry.sequenceNumber;
      }
    }
    const nextSeq = maxSeq + 1n;

    ctx.db.ledgerEntries.insert({
      id: 0n,
      sessionId: args.sessionId,
      phase: args.phase,
      plan: args.plan,
      action: args.action,
      result: args.result,
      timestamp: args.timestamp,
      detailsJson: args.detailsJson,
      sequenceNumber: nextSeq,
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

/**
 * Upsert the singleton session plan (id=1).
 * Singleton contract: always targets id=1n. PK uniqueness prevents duplicates.
 */
export const update_session_plan = spacetimedb.reducer(
  {
    planJson: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const SINGLETON_ID = 1n;
    const row = {
      id: SINGLETON_ID,
      planJson: args.planJson,
      timestamp: args.timestamp,
    };
    const existing = ctx.db.sessionPlans.id.find(SINGLETON_ID);
    if (existing) {
      ctx.db.sessionPlans.id.update({ ...existing, ...row });
    } else {
      ctx.db.sessionPlans.insert(row);
    }
  },
);

/**
 * Upsert the singleton tribunal result (id=1).
 * Singleton contract: always targets id=1n. PK uniqueness prevents duplicates.
 */
export const update_tribunal_result = spacetimedb.reducer(
  {
    resultJson: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const SINGLETON_ID = 1n;
    const row = {
      id: SINGLETON_ID,
      resultJson: args.resultJson,
      timestamp: args.timestamp,
    };
    const existing = ctx.db.tribunalResults.id.find(SINGLETON_ID);
    if (existing) {
      ctx.db.tribunalResults.id.update({ ...existing, ...row });
    } else {
      ctx.db.tribunalResults.insert(row);
    }
  },
);

/**
 * Upsert the singleton memory files (id=1).
 * Singleton contract: always targets id=1n. PK uniqueness prevents duplicates.
 */
export const update_memory_files = spacetimedb.reducer(
  {
    brainMd: t.string(),
    memoryMd: t.string(),
    workingMd: t.string(),
    proceduresMd: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const SINGLETON_ID = 1n;
    const row = {
      id: SINGLETON_ID,
      brainMd: args.brainMd,
      memoryMd: args.memoryMd,
      workingMd: args.workingMd,
      proceduresMd: args.proceduresMd,
      timestamp: args.timestamp,
    };
    const existing = ctx.db.memoryFiles.id.find(SINGLETON_ID);
    if (existing) {
      ctx.db.memoryFiles.id.update({ ...existing, ...row });
    } else {
      ctx.db.memoryFiles.insert(row);
    }
  },
);

/**
 * Upsert the singleton metrics (id=1).
 * Singleton contract: always targets id=1n. PK uniqueness prevents duplicates.
 */
export const update_metrics = spacetimedb.reducer(
  {
    metricsJson: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const SINGLETON_ID = 1n;
    const row = {
      id: SINGLETON_ID,
      metricsJson: args.metricsJson,
      timestamp: args.timestamp,
    };
    const existing = ctx.db.metrics.id.find(SINGLETON_ID);
    if (existing) {
      ctx.db.metrics.id.update({ ...existing, ...row });
    } else {
      ctx.db.metrics.insert(row);
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
    const VALID_PRIORITIES = ["low", "medium", "high", "critical"];
    if (!VALID_PRIORITIES.includes(args.priority)) {
      throw new SenderError(
        `Invalid priority: must be one of ${VALID_PRIORITIES.join(", ")}`,
      );
    }
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

/**
 * Upsert the singleton workflow config (id=1).
 * Singleton contract: always targets id=1n. PK uniqueness prevents duplicates.
 */
export const update_workflow_config = spacetimedb.reducer(
  {
    configJson: t.string(),
    timestamp: t.u64(),
  },
  (ctx, args) => {
    const SINGLETON_ID = 1n;
    const row = {
      id: SINGLETON_ID,
      configJson: args.configJson,
      timestamp: args.timestamp,
    };
    const existing = ctx.db.workflowConfig.id.find(SINGLETON_ID);
    if (existing) {
      ctx.db.workflowConfig.id.update({ ...existing, ...row });
    } else {
      ctx.db.workflowConfig.insert(row);
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
        ...existing[0]!,
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

// ─── Audit Findings Reducers ──────────────────────────────────

/** Append a new audit finding. */
export const append_audit_finding = spacetimedb.reducer(
  {
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
    createdAt: t.u64(),
  },
  (ctx, args) => {
    const VALID_SEVERITIES = ["critical", "high", "medium", "low", "info"];
    if (!VALID_SEVERITIES.includes(args.severity)) {
      throw new SenderError(
        `Invalid severity: must be one of ${VALID_SEVERITIES.join(", ")}`,
      );
    }

    ctx.db.auditFindings.insert({
      id: 0n,
      sessionId: args.sessionId,
      phase: args.phase,
      sourceAgent: args.sourceAgent,
      severity: args.severity,
      category: args.category,
      filePath: args.filePath,
      lineStart: args.lineStart,
      lineEnd: args.lineEnd,
      finding: args.finding,
      suggestedFix: args.suggestedFix,
      contextSnippet: args.contextSnippet,
      status: "pending",
      resolutionNotes: "",
      createdAt: args.createdAt,
      resolvedAt: undefined,
    });
  },
);

/** Update the status of an existing audit finding. */
export const update_finding_status = spacetimedb.reducer(
  {
    findingId: t.u64(),
    status: t.string(),
    resolutionNotes: t.string(),
    resolvedAt: t.u64(),
  },
  (ctx, args) => {
    const VALID_STATUSES = [
      "pending",
      "in_progress",
      "resolved",
      "dismissed",
      "wont_fix",
    ];
    if (!VALID_STATUSES.includes(args.status)) {
      throw new SenderError(
        `Invalid status: must be one of ${VALID_STATUSES.join(", ")}`,
      );
    }

    if (args.resolutionNotes.length > 4096) {
      throw new SenderError("resolutionNotes exceeds 4096 character limit");
    }

    const existing = ctx.db.auditFindings.id.find(args.findingId);
    if (!existing) throw new SenderError("Audit finding not found");
    ctx.db.auditFindings.id.update({
      ...existing,
      status: args.status,
      resolutionNotes: args.resolutionNotes,
      resolvedAt: args.resolvedAt,
    });
  },
);

/** Bulk dismiss all findings matching a session and optional filters. */
export const bulk_dismiss_findings = spacetimedb.reducer(
  {
    sessionId: t.string(),
    category: t.string(),
    severity: t.string(),
    reason: t.string(),
    resolvedAt: t.u64(),
  },
  (ctx, args) => {
    if (!args.sessionId) throw new SenderError("sessionId is required");
    const matches = [
      ...ctx.db.auditFindings.audit_findings_session_id.filter(args.sessionId),
    ];
    for (const row of matches) {
      // Skip already-resolved or dismissed findings
      if (row.status === "resolved" || row.status === "dismissed") continue;
      // Apply category filter if provided
      if (args.category && row.category !== args.category) continue;
      // Apply severity filter if provided
      if (args.severity && row.severity !== args.severity) continue;

      ctx.db.auditFindings.id.update({
        ...row,
        status: "dismissed",
        resolutionNotes: args.reason,
        resolvedAt: args.resolvedAt,
      });
    }
  },
);

// ─── TTL Cleanup (Scheduled) ──────────────────────────────────

/** Scheduled reducer: cleans up old observer_events and token_usage rows. */
export const run_ttl_cleanup = spacetimedb.reducer(
  { arg: CleanupSchedule.rowType },
  (ctx, { arg }) => {
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const MICROS_PER_HOUR = 3_600_000_000n;

    const eventsMaxAge =
      arg.eventsMaxAgeHours > 0n ? arg.eventsMaxAgeHours : 24n;
    const usageMaxAge = arg.usageMaxAgeHours > 0n ? arg.usageMaxAgeHours : 168n;
    const preserve = arg.preserveCount > 0n ? arg.preserveCount : 1000n;

    // Schedule the next cleanup FIRST (1 hour from now) to ensure the
    // chain continues even if deletions below throw an error.
    const nextRun = nowMicros + MICROS_PER_HOUR;
    ctx.db.cleanupSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(nextRun),
      eventsMaxAgeHours: arg.eventsMaxAgeHours,
      usageMaxAgeHours: arg.usageMaxAgeHours,
      preserveCount: arg.preserveCount,
    });

    // --- Clean observer_events ---
    const eventsCutoff = nowMicros - eventsMaxAge * MICROS_PER_HOUR;
    const allEvents = [...ctx.db.observerEvents.iter()];
    // Sort newest-first so we can preserve the most recent N
    allEvents.sort((a, b) =>
      b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0,
    );

    let eventsDeleted = 0;
    for (let i = 0; i < allEvents.length; i++) {
      const evt = allEvents[i]!;
      // Always keep the first `preserve` rows; delete the rest if older than cutoff
      if (BigInt(i) >= preserve && evt.timestamp < eventsCutoff) {
        ctx.db.observerEvents.id.delete(evt.id);
        eventsDeleted++;
      }
    }

    // --- Clean token_usage ---
    const usageCutoff = nowMicros - usageMaxAge * MICROS_PER_HOUR;
    const allUsage = [...ctx.db.tokenUsage.iter()];
    allUsage.sort((a, b) =>
      b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0,
    );

    let usageDeleted = 0;
    for (let i = 0; i < allUsage.length; i++) {
      const row = allUsage[i]!;
      if (BigInt(i) >= preserve && row.timestamp < usageCutoff) {
        ctx.db.tokenUsage.id.delete(row.id);
        usageDeleted++;
      }
    }

    // --- Clean ledger_entries ---
    const ledgerCutoff = nowMicros - eventsMaxAge * MICROS_PER_HOUR;
    const allLedger = [...ctx.db.ledgerEntries.iter()];
    allLedger.sort((a, b) =>
      b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0,
    );

    let ledgerDeleted = 0;
    for (let i = 0; i < allLedger.length; i++) {
      const row = allLedger[i]!;
      if (BigInt(i) >= preserve && row.timestamp < ledgerCutoff) {
        ctx.db.ledgerEntries.id.delete(row.id);
        ledgerDeleted++;
      }
    }

    // --- Clean iteration_records ---
    const iterationCutoff = nowMicros - eventsMaxAge * MICROS_PER_HOUR;
    const allIterations = [...ctx.db.iterationRecords.iter()];
    allIterations.sort((a, b) =>
      b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0,
    );

    let iterationsDeleted = 0;
    for (let i = 0; i < allIterations.length; i++) {
      const row = allIterations[i]!;
      if (BigInt(i) >= preserve && row.timestamp < iterationCutoff) {
        ctx.db.iterationRecords.id.delete(row.id);
        iterationsDeleted++;
      }
    }

    // --- Clean tool_calls ---
    const toolCallsCutoff = nowMicros - eventsMaxAge * MICROS_PER_HOUR;
    const allToolCalls = [...ctx.db.toolCalls.iter()];
    allToolCalls.sort((a, b) =>
      b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0,
    );

    let toolCallsDeleted = 0;
    for (let i = 0; i < allToolCalls.length; i++) {
      const row = allToolCalls[i]!;
      if (BigInt(i) >= preserve && row.timestamp < toolCallsCutoff) {
        ctx.db.toolCalls.id.delete(row.id);
        toolCallsDeleted++;
      }
    }

    // --- Clean context_snapshots ---
    const snapshotsCutoff = nowMicros - eventsMaxAge * MICROS_PER_HOUR;
    const allSnapshots = [...ctx.db.contextSnapshots.iter()];
    allSnapshots.sort((a, b) =>
      b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0,
    );

    let snapshotsDeleted = 0;
    for (let i = 0; i < allSnapshots.length; i++) {
      const row = allSnapshots[i]!;
      if (BigInt(i) >= preserve && row.timestamp < snapshotsCutoff) {
        ctx.db.contextSnapshots.id.delete(row.id);
        snapshotsDeleted++;
      }
    }

    // --- Clean decision_logs ---
    const decisionsCutoff = nowMicros - eventsMaxAge * MICROS_PER_HOUR;
    const allDecisions = [...ctx.db.decisionLogs.iter()];
    allDecisions.sort((a, b) =>
      b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0,
    );

    let decisionsDeleted = 0;
    for (let i = 0; i < allDecisions.length; i++) {
      const row = allDecisions[i]!;
      if (BigInt(i) >= preserve && row.timestamp < decisionsCutoff) {
        ctx.db.decisionLogs.id.delete(row.id);
        decisionsDeleted++;
      }
    }

    console.log(
      `TTL cleanup: deleted ${eventsDeleted} events, ${usageDeleted} usage, ${ledgerDeleted} ledger, ${iterationsDeleted} iterations, ${toolCallsDeleted} tool calls, ${snapshotsDeleted} snapshots, ${decisionsDeleted} decisions`,
    );
  },
);

// Wire up the scheduled table's reducer reference
reducerRef.current = run_ttl_cleanup;

// ─── Export Placeholders ───────────────────────────────────────

/** Placeholder for JSON export. No-op for now. */
export const export_to_json = spacetimedb.reducer((_ctx) => {
  // Future: export all tables to JSON
});

/** Placeholder for Markdown export. No-op for now. */
export const export_to_md = spacetimedb.reducer((_ctx) => {
  // Future: export session summary to Markdown
});
