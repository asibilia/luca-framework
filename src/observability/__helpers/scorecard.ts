/**
 * Agent effectiveness scorecard engine.
 *
 * Pure functions for creating, updating, querying, and persisting
 * per-agent telemetry data. Provides the data foundation for
 * routing decisions and effectiveness dashboards.
 *
 * @module
 */
import orderBy from "lodash/orderBy";
import type {
  Scorecard,
  ScorecardEntry,
  ScorecardQuery,
  ScorecardReport,
  ScorecardReportEntry,
} from "../__schemas/observability.schemas";
import { scorecardSchema } from "../__schemas/observability.schemas";

// ─── R12.1: Entry Creation ──────────────────────────────────────────────────

/**
 * Create a new scorecard entry for an agent.
 *
 * @param agentName - The agent's registry name
 * @returns A fresh ScorecardEntry with zeroed counters
 */
export function createScorecardEntry(agentName: string): ScorecardEntry {
  return {
    agent_name: agentName,
    invocation_count: 0,
    success_count: 0,
    failure_count: 0,
    total_duration_ms: 0,
    avg_duration_ms: 0,
    last_invoked: null,
  };
}

/**
 * Create an empty scorecard.
 *
 * @returns A new Scorecard with no entries
 */
export function createScorecard(): Scorecard {
  return {
    entries: {},
    updated_at: new Date().toISOString(),
  };
}

// ─── R12.1: Invocation Recording ────────────────────────────────────────────

/**
 * Record an agent invocation in the scorecard.
 *
 * Creates the agent entry if it doesn't exist. Updates counters and
 * recalculates the average duration. Returns a new scorecard (immutable).
 *
 * @param scorecard - Current scorecard state
 * @param agentName - The agent that was invoked
 * @param success - Whether the invocation succeeded
 * @param durationMs - Execution duration in milliseconds
 * @returns Updated scorecard with the invocation recorded
 */
export function recordInvocation(
  scorecard: Scorecard,
  agentName: string,
  success: boolean,
  durationMs: number,
): Scorecard {
  const existing =
    scorecard.entries[agentName] ?? createScorecardEntry(agentName);

  const invocationCount = existing.invocation_count + 1;
  const successCount = existing.success_count + (success ? 1 : 0);
  const failureCount = existing.failure_count + (success ? 0 : 1);
  const totalDuration = existing.total_duration_ms + durationMs;
  const avgDuration = totalDuration / invocationCount;

  const updatedEntry: ScorecardEntry = {
    agent_name: agentName,
    invocation_count: invocationCount,
    success_count: successCount,
    failure_count: failureCount,
    total_duration_ms: totalDuration,
    avg_duration_ms: Math.round(avgDuration * 100) / 100,
    last_invoked: new Date().toISOString(),
  };

  return {
    entries: {
      ...scorecard.entries,
      [agentName]: updatedEntry,
    },
    updated_at: new Date().toISOString(),
  };
}

// ─── R12.3: Scorecard Query ─────────────────────────────────────────────────

/**
 * Query the scorecard with optional filtering and sorting.
 *
 * Used by model routing to query agent effectiveness for decisions.
 *
 * @param scorecard - The scorecard to query
 * @param query - Filter/sort criteria
 * @returns Matching entries sorted as requested
 */
export function queryScorecard(
  scorecard: Scorecard,
  query: ScorecardQuery = {},
): ScorecardEntry[] {
  let entries = Object.values(scorecard.entries);

  // Filter by agent name
  if (query.agent_name) {
    entries = entries.filter((e) => e.agent_name === query.agent_name);
  }

  // Filter by minimum invocations
  if (query.min_invocations !== undefined) {
    entries = entries.filter(
      (e) => e.invocation_count >= query.min_invocations!,
    );
  }

  // Sort
  if (query.sort_by) {
    const sortOrder = query.sort_order ?? "desc";
    if (query.sort_by === "success_rate") {
      // Compute success rate for sorting
      entries = orderBy(
        entries,
        (e) =>
          e.invocation_count > 0 ? e.success_count / e.invocation_count : 0,
        sortOrder,
      );
    } else {
      entries = orderBy(entries, query.sort_by, sortOrder);
    }
  }

  // Limit
  if (query.limit !== undefined) {
    entries = entries.slice(0, query.limit);
  }

  return entries;
}

// ─── R12.4: Report Generation ───────────────────────────────────────────────

/**
 * Generate a formatted scorecard report.
 *
 * @param scorecard - The scorecard to report on
 * @returns A structured report with computed success rates
 */
export function formatScorecardReport(scorecard: Scorecard): ScorecardReport {
  const entries: ScorecardReportEntry[] = orderBy(
    Object.values(scorecard.entries),
    "invocation_count",
    "desc",
  ).map((e) => ({
    agent_name: e.agent_name,
    invocations: e.invocation_count,
    success_rate:
      e.invocation_count > 0
        ? Math.round((e.success_count / e.invocation_count) * 1000) / 1000
        : 0,
    avg_duration_ms: e.avg_duration_ms,
    last_invoked: e.last_invoked,
  }));

  return {
    generated_at: new Date().toISOString(),
    total_agents: entries.length,
    total_invocations: entries.reduce((sum, e) => sum + e.invocations, 0),
    entries,
  };
}

// ─── R12.2: Persistence ─────────────────────────────────────────────────────

/**
 * Load a scorecard from a JSON file.
 *
 * Returns an empty scorecard if the file doesn't exist or is invalid.
 *
 * @param path - File path to load from
 * @returns Parsed scorecard or empty scorecard on failure
 */
export async function loadScorecard(path: string): Promise<Scorecard> {
  try {
    const file = Bun.file(path);
    const exists = await file.exists();
    if (!exists) return createScorecard();

    const raw = await file.json();
    const result = scorecardSchema.safeParse(raw);
    return result.success ? result.data : createScorecard();
  } catch {
    return createScorecard();
  }
}

/**
 * Save a scorecard to a JSON file.
 *
 * @param scorecard - The scorecard to persist
 * @param path - File path to write to
 */
export async function saveScorecard(
  scorecard: Scorecard,
  path: string,
): Promise<void> {
  await Bun.write(path, JSON.stringify(scorecard, null, 2));
}
