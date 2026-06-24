/**
 * Session ledger — append-only JSONL log of pipeline events.
 *
 * `.luca/ledger.jsonl` is the full history of a workflow session;
 * `.luca/state.json` is working memory (current state only). The ledger
 * captures every significant event — mode transitions, phase start/complete,
 * verification results, convergence state, and timing — each stamped with a
 * `runId` so postmortem tooling can isolate a single pipeline run.
 *
 * Ported from luca-mastracode `state/session-ledger.ts`. Changes from the
 * mastracode original:
 *   - `.planning/session-ledger.jsonl` → `.luca/ledger.jsonl` (via
 *     `lucaRootPaths.ledger`).
 *   - `cwd` is parameterized (mastracode used an implicit `process.cwd()`),
 *     and `runId` is passed in explicitly rather than resolved from state
 *     inside the writer.
 *   - `readLedger` skips malformed lines individually instead of discarding
 *     the whole file on the first parse error.
 *
 * Not ported (no `.luca/` equivalent — see plan §5.5 / §5.7): the
 * `.planning/phases/<slug>/runs/` run-archival layer (`archivePriorRun`,
 * `listArchivedRuns`, `resolveRunArtifactDir`) and `routing-history.jsonl`
 * (`appendRoutingHistory`/`readRoutingHistory` — zero consumers, absent from
 * the `.luca/` contract). `generateRunId` now lives in the telemetry domain.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { LedgerEntrySchema, type LedgerEntry } from './schemas.ts'

import { lucaRootPaths } from '../luca-dir/index.ts'

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

export interface AppendLedgerOptions {
    /** Repo root — `.luca/ledger.jsonl` is resolved relative to this. */
    cwd: string
    /** Run identifier stamped onto the entry. */
    runId: string
    /** Event name. */
    event: string
    /** Free-form per-event payload (defaults to `{}`). */
    data?: Record<string, unknown>
}

/** Append an event to the session ledger. */
export function appendLedger(opts: AppendLedgerOptions): void {
    const entry: LedgerEntry = {
        timestamp: new Date().toISOString(),
        runId: opts.runId,
        event: opts.event,
        data: opts.data ?? {},
    }
    const p = join(opts.cwd, lucaRootPaths.ledger)
    mkdirSync(dirname(p), { recursive: true })
    appendFileSync(p, `${JSON.stringify(entry)}\n`, 'utf-8')
}

// ---------------------------------------------------------------------------
// Readers (no-throw)
// ---------------------------------------------------------------------------

/**
 * Read all ledger entries for the current session.
 *
 * Returns `[]` when the file is missing, empty, or unreadable. Lines that are
 * not valid JSON or do not satisfy {@link LedgerEntrySchema} are skipped — a
 * one-line `console.warn` is emitted per skipped line so operators have an
 * audible signal that the file is partially corrupt (audit ref M5). The
 * mastracode original discarded the whole file on the first parse error;
 * this is strictly an improvement.
 */
export function readLedger(opts: { cwd: string }): LedgerEntry[] {
    const p = join(opts.cwd, lucaRootPaths.ledger)
    if (!existsSync(p)) return []

    try {
        const content = readFileSync(p, 'utf-8')
        if (!content.trim()) return []

        const entries: LedgerEntry[] = []
        let lineNumber = 0
        for (const line of content.split('\n')) {
            lineNumber += 1
            if (!line.trim()) continue
            let parsedJson: unknown
            try {
                parsedJson = JSON.parse(line)
            } catch {
                console.warn(
                    `readLedger: skipping malformed JSON at ${p}:${lineNumber}`
                )
                continue
            }
            const parsed = LedgerEntrySchema.safeParse(parsedJson)
            if (parsed.success) {
                entries.push(parsed.data)
            } else {
                console.warn(
                    `readLedger: skipping schema-invalid entry at ${p}:${lineNumber}`
                )
            }
        }
        return entries
    } catch {
        return []
    }
}

/** Read ledger entries scoped to a single run. */
export function readLedgerForRun(opts: {
    cwd: string
    runId: string
}): LedgerEntry[] {
    return readLedger({ cwd: opts.cwd }).filter((e) => e.runId === opts.runId)
}

/** Read ledger entries filtered by event type, optionally scoped to a run. */
export function getLedgerByEvent(opts: {
    cwd: string
    event: string
    runId?: string
}): LedgerEntry[] {
    const entries = readLedger({ cwd: opts.cwd }).filter(
        (e) => e.event === opts.event
    )
    return opts.runId ? entries.filter((e) => e.runId === opts.runId) : entries
}

// ---------------------------------------------------------------------------
// Run summaries
// ---------------------------------------------------------------------------

export interface RunSummary {
    runId: string
    firstEvent: string
    lastEvent: string
    eventCount: number
}

/** List the distinct runs present in the ledger. */
export function listRuns(opts: { cwd: string }): RunSummary[] {
    const entries = readLedger({ cwd: opts.cwd })
    const byRun = new Map<
        string,
        { first: string; last: string; count: number }
    >()
    for (const e of entries) {
        const id = e.runId || 'unknown'
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

// ---------------------------------------------------------------------------
// Session metrics
// ---------------------------------------------------------------------------

export interface SessionMetrics {
    runId?: string
    totalEvents: number
    modeTransitions: number
    phasesCompleted: number
    totalIterations: number
    firstEvent?: string
    lastEvent?: string
    durationMs?: number
}

/** Compute aggregate session metrics from the ledger. */
export function computeSessionMetrics(opts: {
    cwd: string
    runId?: string
}): SessionMetrics {
    const entries = opts.runId
        ? readLedgerForRun({ cwd: opts.cwd, runId: opts.runId })
        : readLedger({ cwd: opts.cwd })

    if (entries.length === 0) {
        return {
            runId: opts.runId,
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
        runId: opts.runId ?? first?.runId,
        totalEvents: entries.length,
        modeTransitions: transitions.length,
        phasesCompleted: phaseCompletions.length,
        totalIterations: iterations.length,
        firstEvent: first?.timestamp,
        lastEvent: last?.timestamp,
        durationMs,
    }
}
