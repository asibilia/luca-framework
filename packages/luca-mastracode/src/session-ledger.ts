/**
 * Session ledger — append-only JSONL log of pipeline events.
 *
 * `session-ledger.jsonl` is the full history of a session.
 * `luca-state.json` is working memory (current state).
 *
 * The ledger captures every significant event: mode transitions, phase
 * start/complete, verification results, convergence state, and timing.
 */
import { existsSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const LEDGER_FILE = '.planning/session-ledger.jsonl';
const ROUTING_HISTORY_FILE = '.planning/routing-history.jsonl';

// ---------------------------------------------------------------------------
// Session ledger
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  timestamp: string;
  event: string;
  data: Record<string, unknown>;
}

function ensurePlanningDir(): void {
  const dir = join(process.cwd(), '.planning');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Append an event to the session ledger.
 */
export function appendLedger(event: string, data: Record<string, unknown> = {}): void {
  ensurePlanningDir();
  const entry: LedgerEntry = {
    timestamp: new Date().toISOString(),
    event,
    data,
  };
  appendFileSync(join(process.cwd(), LEDGER_FILE), JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * Read all ledger entries for the current session.
 */
export function readLedger(): LedgerEntry[] {
  const p = join(process.cwd(), LEDGER_FILE);
  if (!existsSync(p)) return [];
  try {
    return readFileSync(p, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * Get ledger entries filtered by event type.
 */
export function getLedgerByEvent(event: string): LedgerEntry[] {
  return readLedger().filter(e => e.event === event);
}

/**
 * Compute session metrics from the ledger.
 */
export function computeSessionMetrics(): {
  totalEvents: number;
  modeTransitions: number;
  phasesCompleted: number;
  totalIterations: number;
  firstEvent?: string;
  lastEvent?: string;
  durationMs?: number;
} {
  const entries = readLedger();
  if (entries.length === 0) {
    return { totalEvents: 0, modeTransitions: 0, phasesCompleted: 0, totalIterations: 0 };
  }

  const transitions = entries.filter(e => e.event === 'mode-transition');
  const phaseCompletions = entries.filter(e => e.event === 'phase-complete');
  const iterations = entries.filter(e => e.event === 'iteration-complete');

  const first = entries[0];
  const last = entries[entries.length - 1];
  const durationMs = first && last
    ? new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()
    : undefined;

  return {
    totalEvents: entries.length,
    modeTransitions: transitions.length,
    phasesCompleted: phaseCompletions.length,
    totalIterations: iterations.length,
    firstEvent: first?.timestamp,
    lastEvent: last?.timestamp,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Routing history
// ---------------------------------------------------------------------------

export interface RoutingEntry {
  timestamp: string;
  agentType: string;
  complexity: string;
  profile: string;
  resolvedModel: string;
  phase?: string;
}

/**
 * Append a routing decision to the routing history.
 */
export function appendRoutingHistory(entry: Omit<RoutingEntry, 'timestamp'>): void {
  ensurePlanningDir();
  const full: RoutingEntry = { ...entry, timestamp: new Date().toISOString() };
  appendFileSync(join(process.cwd(), ROUTING_HISTORY_FILE), JSON.stringify(full) + '\n', 'utf-8');
}

/**
 * Read routing history (last N entries for adaptive adjustment).
 */
export function readRoutingHistory({ limit = 20 }: { limit?: number } = {}): RoutingEntry[] {
  const p = join(process.cwd(), ROUTING_HISTORY_FILE);
  if (!existsSync(p)) return [];
  try {
    const entries = readFileSync(p, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as RoutingEntry);
    return entries.slice(-limit);
  } catch {
    return [];
  }
}
