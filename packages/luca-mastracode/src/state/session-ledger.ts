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
import { basename, join } from 'node:path'

import { readLucaState, writeLucaState } from './luca-store.js'

import {
    CONFIDENCE_JOURNAL_PATH,
    LEDGER_PATH,
    ROUTING_HISTORY_PATH,
    RUNS_ROOT,
    VERIFICATION_HISTORY_PATH,
    phaseDir,
    phasePath,
    planningRoot,
} from '../util/phase-paths.js'

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
    const dir = planningRoot()
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
    appendFileSync(LEDGER_PATH(), JSON.stringify(entry) + '\n', 'utf-8')
}

/**
 * Read all ledger entries for the current session.
 */
export function readLedger(): LedgerEntry[] {
    const p = LEDGER_PATH()
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
export function getLedgerByEvent(event: string, runId?: string): LedgerEntry[] {
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
 * Yield candidate run-archive root directories in lookup order:
 *   1. `.planning/phases/<currentPhaseSlug>/runs/` when a phase is active.
 *   2. `.planning/phases/<other-slug>/runs/` for every other phase dir
 *      that exists on disk (so historical runs from prior phases stay
 *      visible after a new phase starts — PR #222 review).
 *   3. `.planning/runs/` (legacy / pre-triage layout).
 *
 * Issue #220: archives now live under the active phase dir, but legacy
 * runs predate the migration and stay at root. Callers iterate this list
 * and use the first match for a given runId; `listArchivedRuns()` unions
 * across all roots.
 */
function candidateArchiveRoots(): string[] {
    const slug = readLucaState().currentPhaseSlug
    const roots: string[] = []
    const seen = new Set<string>()
    const add = (p: string) => {
        if (!seen.has(p)) {
            seen.add(p)
            roots.push(p)
        }
    }
    if (slug) {
        add(join(phaseDir(slug), 'runs'))
    }
    // Discover all sibling phase dirs and include their runs/ subdirs so
    // recurrence detection and postmortem listing keep seeing archived runs
    // from earlier phases after the active slug changes.
    const phasesRoot = join(planningRoot(), 'phases')
    if (existsSync(phasesRoot)) {
        try {
            for (const entry of readdirSync(phasesRoot, {
                withFileTypes: true,
            })) {
                if (!entry.isDirectory()) continue
                add(join(phasesRoot, entry.name, 'runs'))
            }
        } catch {
            // ignore unreadable phases/ root
        }
    }
    add(RUNS_ROOT())
    return roots
}

/**
 * List runIds for which an archive directory exists on disk. Searches both
 * the active phase's runs dir (`.planning/phases/<slug>/runs/<runId>/`)
 * and the legacy root (`.planning/runs/<runId>/`). Returns the union;
 * sort order is unspecified — callers should sort if needed.
 */
export function listArchivedRuns(): string[] {
    const seen = new Set<string>()
    for (const archiveRoot of candidateArchiveRoots()) {
        if (!existsSync(archiveRoot)) continue
        try {
            for (const name of readdirSync(archiveRoot)) {
                try {
                    if (statSync(join(archiveRoot, name)).isDirectory()) {
                        seen.add(name)
                    }
                } catch {
                    // ignore unreadable entries
                }
            }
        } catch {
            // ignore unreadable archive root
        }
    }
    return Array.from(seen)
}

/**
 * Resolve the directory holding JSONL artifacts for a given runId. Returns
 * `.planning/` if `runId` matches the current run, otherwise tries (in
 * order) `.planning/phases/<currentPhaseSlug>/runs/<runId>/` and
 * `.planning/runs/<runId>/`, returning the first that exists, else null.
 */
export function resolveRunArtifactDir(runId: string): string | null {
    const root = planningRoot()
    const current = readLucaState().runId
    if (current === runId) {
        return existsSync(root) ? root : null
    }
    for (const archiveRoot of candidateArchiveRoots()) {
        const archiveDir = join(archiveRoot, runId)
        if (existsSync(archiveDir)) return archiveDir
    }
    return null
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
 * Archive end-of-session telemetry for a run.
 *
 * When a phase slug is set on luca-state, the archive directory is
 *   .planning/phases/<slug>/runs/<runId>/
 * matching the per-phase artifact tree. When no slug is set (legacy or
 * pre-triage state), the archive falls back to .planning/runs/<runId>/.
 *
 * Source files (cross-run JSONL audit logs at .planning/ root) are MOVED
 * by basename into the archive dir via renameSync — preserving the prior
 * "clear root for next run" semantic. The single-snapshot
 * verification-result.json (per-phase) is moved from
 * .planning/phases/<slug>/verification-result.json when present; this
 * matters because a stale wave-1 PASS from a prior run can otherwise
 * silently satisfy the wave/phase guards in workflow-state and bypass
 * verification on the next run.
 *
 * Best-effort: missing source files and cross-device rename failures are
 * silently skipped.
 *
 * @see issue #220
 */
export function archivePriorRun(runId: string): void {
    if (!runId) return
    if (!existsSync(planningRoot())) return

    const slug = readLucaState().currentPhaseSlug
    const archiveBase = slug ? join(phaseDir(slug), 'runs') : RUNS_ROOT()
    const targetDir = join(archiveBase, runId)
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

    // Cross-run JSONL audit logs live at .planning/ root (Decision #4).
    const sources: string[] = [
        LEDGER_PATH(),
        ROUTING_HISTORY_PATH(),
        VERIFICATION_HISTORY_PATH(),
        CONFIDENCE_JOURNAL_PATH(),
    ]
    // Per-phase single-snapshot verification result. When slug is absent,
    // phasePath() falls back to root — same legacy location as before.
    sources.push(phasePath('verification-result.json', slug))

    for (const src of sources) {
        if (!existsSync(src)) continue
        const dest = join(targetDir, basename(src))
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
    appendFileSync(ROUTING_HISTORY_PATH(), JSON.stringify(full) + '\n', 'utf-8')
}

/**
 * Read routing history (last N entries for adaptive adjustment).
 */
export function readRoutingHistory({
    limit = 20,
    runId,
}: { limit?: number; runId?: string } = {}): RoutingEntry[] {
    const p = ROUTING_HISTORY_PATH()
    if (!existsSync(p)) return []
    try {
        const entries = readFileSync(p, 'utf-8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as RoutingEntry)
        const scoped = runId
            ? entries.filter((e) => e.runId === runId)
            : entries
        return scoped.slice(-limit)
    } catch {
        return []
    }
}
