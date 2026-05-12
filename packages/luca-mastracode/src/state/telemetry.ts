/**
 * Wave Duration Telemetry — append-only structured event log per pipeline run.
 *
 * Data layer: `.planning/telemetry/<runId>.jsonl` (machine-readable, append-only).
 *
 * Produced by `workflowState` action handlers (`start-phase`, `advance-wave`,
 * `complete-phase`) and consumed by a future aggregator skill (`/luca-telemetry-report`).
 *
 * ## Schema contract (v1 — LOCKED)
 *
 * Four follow-on telemetry todos consume this writer. To avoid breaking them:
 *
 * 1. Every record carries `v: 1`.
 * 2. Fields may be **added** in the same major version. Never rename or remove.
 * 3. Consumers MUST ignore unknown fields (forward-compatible reads).
 * 4. Breaking changes bump `v: 2` and require a migration window where
 *    consumers handle both versions.
 *
 * ## Fail-safe contract
 *
 * `appendTelemetry()` is best-effort: all errors (disk full, permission,
 * Zod validation) are caught internally and logged to `console.warn`. The
 * pipeline is never on the telemetry critical path.
 *
 * ## Concurrency
 *
 * Append-only via `appendFileSync`. POSIX `O_APPEND` is atomic up to
 * `PIPE_BUF` (~4096 bytes); a single telemetry line is well under that.
 * Single-process append safety is assumed.
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { z } from 'zod'

import { TELEMETRY_PATH } from '../util/phase-paths.js'
import { readLucaState } from './luca-store.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Known event kinds at schema v1.
 *
 * Typed as union | string so future telemetry todos (subagent.invoke,
 * recall.hit, review.iter, …) can extend without amending this file.
 */
export type TelemetryKind =
    | 'phase.start'
    | 'phase.end'
    | 'wave.start'
    | 'wave.end'
    | (string & {})

export interface TelemetryRecord {
    /** Schema version. Locked at 1; bump to 2 only for breaking changes. */
    v: 1
    /** Event timestamp (ISO 8601). */
    ts: string
    /** Run identifier; matches filename `.planning/telemetry/<runId>.jsonl`. */
    runId: string
    /** Event kind — see TelemetryKind. */
    kind: TelemetryKind
    /** Phase name from ROADMAP.md; null when no phase is active. */
    phase: string | null
    /** Phase slug (`.planning/phases/<slug>/`); null pre-triage. */
    slug: string | null
    /** Current wave number (1-indexed); null when not in a wave context. */
    wave: number | null
    /** Triage complexity classification; null pre-triage. */
    complexity: string | null
    /** Oversight mode; null pre-triage. */
    oversight: string | null
    /** Duration in milliseconds (set on `.end` events; null otherwise). */
    durationMs: number | null
    /** Free-form caller metadata; consumers must ignore unknown keys. */
    meta: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Zod schema (defensive validation before write)
// ---------------------------------------------------------------------------

export const TelemetryRecordSchema: z.ZodType<TelemetryRecord> = z.object({
    v: z.literal(1),
    ts: z.string(),
    runId: z.string(),
    kind: z.string(),
    phase: z.string().nullable(),
    slug: z.string().nullable(),
    wave: z.number().nullable(),
    complexity: z.string().nullable(),
    oversight: z.string().nullable(),
    durationMs: z.number().nullable(),
    meta: z.record(z.string(), z.unknown()),
})

// ---------------------------------------------------------------------------
// Builder (pure)
// ---------------------------------------------------------------------------

type Overrides = Partial<
    Omit<TelemetryRecord, 'v' | 'ts' | 'kind' | 'meta'>
>

/**
 * Build a `TelemetryRecord` by reading current pipeline state and applying
 * caller-supplied `meta` + `overrides`. Pure — no disk I/O.
 *
 * `overrides` exists so closing events (`wave.end`, `phase.end`) can pass
 * pre-mutation context (priorWave, priorPhase, priorSlug, durationMs) that
 * `readLucaState()` no longer reflects after the state mutation runs.
 */
export function buildTelemetryRecord(
    kind: TelemetryKind,
    meta: Record<string, unknown> = {},
    overrides: Overrides = {}
): TelemetryRecord {
    const state = readLucaState()
    return {
        v: 1,
        ts: new Date().toISOString(),
        runId: overrides.runId ?? state.runId ?? '',
        kind,
        phase: overrides.phase ?? state.currentPhaseName ?? null,
        slug: overrides.slug ?? state.currentPhaseSlug ?? null,
        wave: overrides.wave ?? state.currentWave ?? null,
        complexity: overrides.complexity ?? state.complexity ?? null,
        oversight: overrides.oversight ?? state.oversight ?? null,
        durationMs: overrides.durationMs ?? null,
        meta,
    }
}

// ---------------------------------------------------------------------------
// Writer (fail-safe; never throws)
// ---------------------------------------------------------------------------

/**
 * Append a telemetry record to `.planning/telemetry/<runId>.jsonl`.
 *
 * **Never throws.** All errors (disk full, permission, Zod validation
 * failure) are caught internally and logged to `console.warn`. Telemetry
 * is never on the pipeline's critical path.
 *
 * @param kind  Event kind (see TelemetryKind)
 * @param meta  Free-form per-event metadata; consumers ignore unknown keys
 * @param overrides Pre-mutation context for closing events. Required when
 *   the caller has already mutated state and `readLucaState()` would return
 *   the wrong phase/wave (see workflow-state.ts `advance-wave` /
 *   `complete-phase` hook sites).
 */
export function appendTelemetry(
    kind: TelemetryKind,
    meta: Record<string, unknown> = {},
    overrides: Overrides = {}
): void {
    try {
        const record = buildTelemetryRecord(kind, meta, overrides)
        // Validate before write. Drop+warn on malformed records — never throw.
        const parsed = TelemetryRecordSchema.safeParse(record)
        if (!parsed.success) {
            console.warn(
                `[telemetry] dropped malformed record: ${parsed.error.message}`
            )
            return
        }
        if (!parsed.data.runId) {
            // Without runId we cannot file the record. Skip silently — this
            // happens pre-triage when the pipeline hasn't minted a runId yet.
            return
        }
        const p = TELEMETRY_PATH(parsed.data.runId)
        mkdirSync(dirname(p), { recursive: true })
        appendFileSync(p, JSON.stringify(parsed.data) + '\n', 'utf-8')
    } catch (err) {
        console.warn(
            `[telemetry] write failed: ${err instanceof Error ? err.message : String(err)}`
        )
    }
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/**
 * Read all telemetry records for a given runId.
 * Returns `[]` if the file does not exist or is empty.
 * Skips malformed lines with a `console.warn`.
 */
export function readTelemetry(runId: string): TelemetryRecord[] {
    const p = TELEMETRY_PATH(runId)
    if (!existsSync(p)) return []

    const content = readFileSync(p, 'utf-8')
    if (!content.trim()) return []

    const records: TelemetryRecord[] = []
    const invalidLines: number[] = []

    for (const [index, line] of content.split('\n').entries()) {
        if (!line.trim()) continue
        try {
            const parsed = JSON.parse(line)
            const validated = TelemetryRecordSchema.safeParse(parsed)
            if (validated.success) {
                records.push(validated.data)
            } else {
                invalidLines.push(index + 1)
            }
        } catch {
            invalidLines.push(index + 1)
        }
    }

    if (invalidLines.length > 0) {
        console.warn(
            `[telemetry] Skipped ${invalidLines.length} invalid ` +
                `entr${invalidLines.length === 1 ? 'y' : 'ies'} ` +
                `in ${p} at line${invalidLines.length === 1 ? '' : 's'} ${invalidLines.join(', ')}.`
        )
    }

    return records
}
