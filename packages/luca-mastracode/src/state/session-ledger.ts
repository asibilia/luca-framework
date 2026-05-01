/**
 * Session ledger — append-only JSONL log of pipeline events.
 *
 * `session-ledger.jsonl` is the full history of a session.
 * `luca-state.json` is working memory (current state).
 *
 * The ledger captures every significant event: mode transitions, phase
 * start/complete, verification results, convergence state, and timing.
 *
 * Each entry is stamped with a `runId` so postmortem tools can isolate a
 * single pipeline run even when multiple runs share a `.planning/` directory.
 */
import {
    existsSync,
    readFileSync,
    mkdirSync,
    appendFileSync,
    renameSync,
    readdirSync,
    statSync,
} from 'node:fs'
import { join } from 'node:path'

import { readLucaState, writeLucaState } from './luca-store.js'

const LEDGER_FILE = '.planning/session-ledger.jsonl'
const ROUTING_HISTORY_FILE = '.planning/routing-history.jsonl'
const VERIFICATION_HISTORY_FILE = '.planning/verification-history.jsonl'
const CONFIDENCE_JOURNAL_FILE = '.planning/confidence-journal.jsonl'
const VERIFICATION_RESULT_FILE = '.planning/verification-result.json'
const RUNS_DIR = '.planning/runs'

// ---------------------------------------------------------------------------
// Run identity
// ---------------------------------------------------------------------------

/**
 * Generate a base36 (lowercase a-z + 0-9) run identifier of the form
 * `run_<timestamp36>_<random36>`. This is intentionally not a real ULID —
 * we only need uniqueness within a `.planning/` directory, not lexicographic
 * monotonicity or 128-bit collision resistance.
 */
function generateRunId(): string {
    const ts = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 10)
    return `run_${ts}_${rand}`
}

/**
 * Resolve the current run ID. If `luca-state.json` doesn't have one yet,
 * mint a new one and persist it.
 */
export function getCurrentRunId(): string {
    const state = readLucaState()
    if (typeof state.runId === 'string' && state.runId.length > 0) {
        return state.runId
    }
    const runId = generateRunId()
    writeLucaState({ runId })
    return runId
}

/**
 * Force a new run ID. Returns the new ID. Use at pipeline-reset.
 */
export function startNewRun(): string {
    const runId = generateRunId()
    writeLucaState({ runId })
    return runId
}

// ---------------------------------------------------------------------------
// Session ledger
// ---------------------------------------------------------------------------

export interface LedgerEntry {
    timestamp: string
    runId: string
    event: string
    data: Record<string, unknown>
}

function ensurePlanningDir(): void {
    const dir = join(process.cwd(), '.planning')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/**
 * Append an event to the session ledger.
 */
export function appendLedger(
    event: string,
    data: Record<string, unknown> = {}
): void {
    ensurePlanningDir()
    const entry: LedgerEntry = {
        timestamp: new Date().toISOString(),
        runId: getCurrentRunId(),
        event,
        data,
    }
    appendFileSync(
        join(process.cwd(), LEDGER_FILE),
        JSON.stringify(entry) + '\n',
        'utf-8'
    )
}

/**
 * Read all ledger entries for the current session.
 */
export function readLedger(): LedgerEntry[] {
    const p = join(process.cwd(), LEDGER_FILE)
    if (!existsSync(p)) return []
    try {
        return readFileSync(p, 'utf-8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
    } catch {
        return []
    }
}

/**
 * Read ledger entries scoped to a single run.
 */
export function readLedgerForRun(runId: string): LedgerEntry[] {
    return readLedger().filter((e) => e.runId === runId)
}

/**
 * Get ledger entries filtered by event type (optionally scoped to a run).
 */
export function getLedgerByEvent(
    event: string,
    runId?: string
): LedgerEntry[] {
    const entries = readLedger().filter((e) => e.event === event)
    return runId ? entries.filter((e) => e.runId === runId) : entries
}

/**
 * List distinct runs present in the ledger, oldest first.
 */
export function listRuns(): Array<{
    runId: string
    firstEvent: string
    lastEvent: string
    eventCount: number
}> {
    const entries = readLedger()
    const byRun = new Map<
        string,
        { first: string; last: string; count: number }
    >()
    for (const e of entries) {
        const id = e.runId ?? 'unknown'
        const existing = byRun.get(id)
        if (!existing) {
            byRun.set(id, { first: e.timestamp, last: e.timestamp, count: 1 })
        } else {
            existing.last = e.timestamp
            existing.count += 1
        }
    }
    return Array.from(byRun.entries()).map(([runId, v]) => ({
        runId,
        firstEvent: v.first,
        lastEvent: v.last,
        eventCount: v.count,
    }))
}

/**
 * List runIds for which `.planning/runs/<runId>/` archive directories exist
 * on disk. Returns an empty array if no archives exist or `.planning/` is
 * missing. Sort order is unspecified — callers should sort if needed.
 */
export function listArchivedRuns(): string[] {
    const archiveRoot = join(process.cwd(), RUNS_DIR)
    if (!existsSync(archiveRoot)) return []
    try {
        // `readdirSync` is synchronous and good enough here — archive
        // directories are small (one entry per run).
        return readdirSync(archiveRoot).filter((name: string) => {
            try {
                return statSync(join(archiveRoot, name)).isDirectory()
            } catch {
                return false
            }
        })
    } catch {
        return []
    }
}

/**
 * Resolve the directory holding JSONL artifacts for a given runId. Returns
 * `.planning/` if `runId` matches the current run, otherwise
 * `.planning/runs/<runId>/` if that archive exists, else null.
 */
export function resolveRunArtifactDir(runId: string): string | null {
    const planningRoot = join(process.cwd(), '.planning')
    const current = readLucaState().runId
    if (current === runId) {
        return existsSync(planningRoot) ? planningRoot : null
    }
    const archiveDir = join(process.cwd(), RUNS_DIR, runId)
    return existsSync(archiveDir) ? archiveDir : null
}

/**
 * Read JSONL entries from a specific file inside an arbitrary directory.
 * Used by postmortem to load artifacts from archived run directories.
 */
export function readJsonlAt<T>(dir: string, basename: string): T[] {
    const p = join(dir, basename)
    if (!existsSync(p)) return []
    try {
        return readFileSync(p, 'utf-8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as T)
    } catch {
        return []
    }
}

/** Filenames used inside both `.planning/` and `.planning/runs/<id>/` */
export const ARTIFACT_FILES = {
    ledger: 'session-ledger.jsonl',
    routing: 'routing-history.jsonl',
    verification: 'verification-history.jsonl',
    confidence: 'confidence-journal.jsonl',
} as const

/**
 * Compute session metrics from the ledger.
 */
export function computeSessionMetrics(runId?: string): {
    runId?: string
    totalEvents: number
    modeTransitions: number
    phasesCompleted: number
    totalIterations: number
    firstEvent?: string
    lastEvent?: string
    durationMs?: number
} {
    const entries = runId ? readLedgerForRun(runId) : readLedger()
    if (entries.length === 0) {
        return {
            runId,
            totalEvents: 0,
            modeTransitions: 0,
            phasesCompleted: 0,
            totalIterations: 0,
        }
    }

    const transitions = entries.filter((e) => e.event === 'mode-transition')
    const phaseCompletions = entries.filter((e) => e.event === 'phase-complete')
    const iterations = entries.filter((e) => e.event === 'iteration-complete')

    const first = entries[0]
    const last = entries[entries.length - 1]
    const durationMs =
        first && last
            ? new Date(last.timestamp).getTime() -
              new Date(first.timestamp).getTime()
            : undefined

    return {
        runId: runId ?? first?.runId,
        totalEvents: entries.length,
        modeTransitions: transitions.length,
        phasesCompleted: phaseCompletions.length,
        totalIterations: iterations.length,
        firstEvent: first?.timestamp,
        lastEvent: last?.timestamp,
        durationMs,
    }
}

// ---------------------------------------------------------------------------
// Run archival
// ---------------------------------------------------------------------------

/**
 * Move the current run's artifacts into `.planning/runs/<runId>/`
 * so the new run starts clean. Best-effort: missing source files are
 * silently skipped.
 *
 * The single-snapshot `verification-result.json` MUST be archived alongside
 * the JSONL histories. Otherwise a stale wave-1 PASS from a prior run can
 * satisfy the wave/phase guards in `workflow-state` and silently bypass
 * verification on the next run.
 */
export function archivePriorRun(runId: string): void {
    if (!runId) return
    const planningRoot = join(process.cwd(), '.planning')
    if (!existsSync(planningRoot)) return

    const targetDir = join(process.cwd(), RUNS_DIR, runId)
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

    const candidates = [
        LEDGER_FILE,
        ROUTING_HISTORY_FILE,
        VERIFICATION_HISTORY_FILE,
        CONFIDENCE_JOURNAL_FILE,
        VERIFICATION_RESULT_FILE,
    ]
    for (const rel of candidates) {
        const src = join(process.cwd(), rel)
        if (!existsSync(src)) continue
        const base = rel.split('/').pop() ?? rel
        const dest = join(targetDir, base)
        try {
            renameSync(src, dest)
        } catch {
            // Cross-device or permission failure — best-effort archival.
        }
    }
}

// ---------------------------------------------------------------------------
// Routing history
// ---------------------------------------------------------------------------

export interface RoutingEntry {
    timestamp: string
    runId: string
    agentType: string
    complexity: string
    profile: string
    resolvedModel: string
    phase?: string
}

/**
 * Append a routing decision to the routing history.
 */
export function appendRoutingHistory(
    entry: Omit<RoutingEntry, 'timestamp' | 'runId'>
): void {
    ensurePlanningDir()
    const full: RoutingEntry = {
        ...entry,
        runId: getCurrentRunId(),
        timestamp: new Date().toISOString(),
    }
    appendFileSync(
        join(process.cwd(), ROUTING_HISTORY_FILE),
        JSON.stringify(full) + '\n',
        'utf-8'
    )
}

/**
 * Read routing history (last N entries for adaptive adjustment).
 */
export function readRoutingHistory({
    limit = 20,
    runId,
}: { limit?: number; runId?: string } = {}): RoutingEntry[] {
    const p = join(process.cwd(), ROUTING_HISTORY_FILE)
    if (!existsSync(p)) return []
    try {
        const entries = readFileSync(p, 'utf-8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as RoutingEntry)
        const scoped = runId ? entries.filter((e) => e.runId === runId) : entries
        return scoped.slice(-limit)
    } catch {
        return []
    }
}
