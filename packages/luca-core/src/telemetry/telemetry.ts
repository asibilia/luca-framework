/**
 * Telemetry writer / reader — append-only structured event log per pipeline
 * run.
 *
 * Data layer: `.luca/telemetry/<runId>.jsonl` (machine-readable, append-only).
 * Records are produced at pipeline-mode and PLAN.md-phase boundaries and
 * consumed by the `/luca-telemetry-report` aggregator skill.
 *
 * ## Fail-safe contract
 *
 * {@link appendTelemetry} is best-effort: all errors (disk full, permission,
 * Zod validation, invalid runId) are caught internally and logged to
 * `console.warn`. The pipeline is never on the telemetry critical path.
 *
 * ## Concurrency
 *
 * Append-only via `appendFileSync`. POSIX `O_APPEND` is atomic up to
 * `PIPE_BUF` (~4096 bytes); a single telemetry line is well under that.
 * Single-process append safety is assumed.
 *
 * Ported from luca-mastracode `state/telemetry.ts`. Two changes from the
 * mastracode original:
 *   - `.planning/telemetry/` → `.luca/telemetry/` (via `telemetryPathFor`).
 *   - `cwd` is parameterized (mastracode used an implicit `process.cwd()`),
 *     and pipeline state is supplied as an explicit {@link TelemetryContext}
 *     rather than read from disk inside the builder.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { RunIdSchema, telemetryPathFor } from '../luca-dir/index.ts'

import { sanitizeForLog } from './helpers/sanitize-for-log.ts'
import {
    TelemetryRecordSchema,
    type TelemetryKind,
    type TelemetryRecord,
} from './schemas.ts'

// ---------------------------------------------------------------------------
// Context + overrides
// ---------------------------------------------------------------------------

/**
 * The subset of pipeline state a telemetry record carries. The caller
 * assembles this from current workflow state — telemetry never reads state
 * itself.
 */
export interface TelemetryContext {
    /** Run identifier; null/'' before the pipeline mints one. */
    runId: string | null
    /** Phase name from the roadmap; null when no phase is active. */
    phase: string | null
    /** Phase slug; null pre-triage. */
    slug: string | null
    /** Current wave number; null when not in a wave context. */
    wave: number | null
    /** Triage complexity classification; null pre-triage. */
    complexity: string | null
    /** Oversight mode; null pre-triage. */
    oversight: string | null
}

/**
 * Closing-event overrides. `wave.end` / `phase.end` events pass pre-mutation
 * context (priorWave, priorPhase, priorSlug, durationMs) that the live state
 * no longer reflects after the state mutation has run.
 */
export type TelemetryOverrides = Partial<
    Omit<TelemetryRecord, 'v' | 'ts' | 'kind' | 'meta'>
>

// ---------------------------------------------------------------------------
// Builder (pure)
// ---------------------------------------------------------------------------

/**
 * Build a {@link TelemetryRecord} from an event kind, the current pipeline
 * context, and caller-supplied `meta` + `overrides`. Pure — no disk I/O.
 */
export function buildTelemetryRecord(
    kind: TelemetryKind,
    ctx: TelemetryContext,
    meta: Record<string, unknown> = {},
    overrides: TelemetryOverrides = {}
): TelemetryRecord {
    return {
        v: 1,
        ts: new Date().toISOString(),
        runId: overrides.runId ?? ctx.runId ?? '',
        kind,
        phase: overrides.phase ?? ctx.phase ?? null,
        slug: overrides.slug ?? ctx.slug ?? null,
        wave: overrides.wave ?? ctx.wave ?? null,
        complexity: overrides.complexity ?? ctx.complexity ?? null,
        oversight: overrides.oversight ?? ctx.oversight ?? null,
        durationMs: overrides.durationMs ?? null,
        meta,
    }
}

// ---------------------------------------------------------------------------
// Writer (fail-safe; never throws)
// ---------------------------------------------------------------------------

export interface AppendTelemetryOptions {
    /** Repo root — `.luca/telemetry/` is resolved relative to this. */
    cwd: string
    /** Event kind (see {@link TelemetryKind}). */
    kind: TelemetryKind
    /** Current pipeline-state context. */
    ctx: TelemetryContext
    /** Free-form per-event metadata; consumers ignore unknown keys. */
    meta?: Record<string, unknown>
    /** Pre-mutation context for closing events. */
    overrides?: TelemetryOverrides
}

/**
 * Append a telemetry record to `.luca/telemetry/<runId>.jsonl`.
 *
 * **Never throws.** All errors (disk full, permission, Zod validation
 * failure, invalid runId) are caught internally and logged to
 * `console.warn`. Telemetry is never on the pipeline's critical path.
 */
export function appendTelemetry(opts: AppendTelemetryOptions): void {
    try {
        const record = buildTelemetryRecord(
            opts.kind,
            opts.ctx,
            opts.meta ?? {},
            opts.overrides ?? {}
        )
        // Validate before write. Drop+warn on malformed records — never throw.
        const parsed = TelemetryRecordSchema.safeParse(record)
        if (!parsed.success) {
            console.warn(
                `[telemetry] dropped malformed record: ${sanitizeForLog(parsed.error.message)}`
            )
            return
        }
        if (!parsed.data.runId) {
            // No runId yet (pre-triage) — nothing to file the record under.
            // Skip silently; this is an expected pre-triage condition.
            return
        }
        // Defense-in-depth path-traversal guard. `runId` originates from
        // user-editable state; a tampered `runId: "../../tmp/evil"` would
        // otherwise escape `.luca/telemetry/`. `RunIdSchema` rejects any
        // token containing `.` or `/`. Drop+warn, never throw.
        const runIdCheck = RunIdSchema.safeParse(parsed.data.runId)
        if (!runIdCheck.success) {
            console.warn(
                `[telemetry] dropped record with invalid runId: ${sanitizeForLog(runIdCheck.error.message)}`
            )
            return
        }
        const p = join(opts.cwd, telemetryPathFor(parsed.data.runId))
        mkdirSync(dirname(p), { recursive: true })
        appendFileSync(p, `${JSON.stringify(parsed.data)}\n`, 'utf-8')
    } catch (err) {
        console.warn(`[telemetry] write failed: ${sanitizeForLog(err)}`)
    }
}

// ---------------------------------------------------------------------------
// Reader (no-throw)
// ---------------------------------------------------------------------------

export interface ReadTelemetryOptions {
    /** Repo root — `.luca/telemetry/` is resolved relative to this. */
    cwd: string
    /** Run identifier whose log to read. */
    runId: string
}

/**
 * Read all telemetry records for a given runId.
 *
 * Returns `[]` if the file does not exist, is empty, or `runId` is invalid.
 * Skips malformed lines with a single `console.warn` that includes the first
 * error. Never throws — the file may disappear between `existsSync` and
 * `readFileSync` (TOCTOU) or be unreadable.
 */
export function readTelemetry(opts: ReadTelemetryOptions): TelemetryRecord[] {
    // Defense-in-depth: telemetryPathFor throws on an invalid runId. Return
    // [] here to preserve a no-throw read contract.
    if (!RunIdSchema.safeParse(opts.runId).success) return []

    const p = join(opts.cwd, telemetryPathFor(opts.runId))
    if (!existsSync(p)) return []

    try {
        const content = readFileSync(p, 'utf-8')
        if (!content.trim()) return []

        const records: TelemetryRecord[] = []
        const invalidLines: number[] = []
        let firstError: string | undefined

        for (const [index, line] of content.split('\n').entries()) {
            if (!line.trim()) continue
            try {
                const validated = TelemetryRecordSchema.safeParse(
                    JSON.parse(line)
                )
                if (validated.success) {
                    records.push(validated.data)
                } else {
                    invalidLines.push(index + 1)
                    if (!firstError) {
                        firstError = sanitizeForLog(validated.error.message)
                    }
                }
            } catch (err) {
                invalidLines.push(index + 1)
                if (!firstError) firstError = sanitizeForLog(err)
            }
        }

        if (invalidLines.length > 0) {
            const plural = invalidLines.length === 1
            console.warn(
                `[telemetry] skipped ${invalidLines.length} invalid ` +
                    `entr${plural ? 'y' : 'ies'} in ${sanitizeForLog(p)} ` +
                    `at line${plural ? '' : 's'} ${invalidLines.join(', ')}` +
                    (firstError ? ` (first error: ${firstError})` : '') +
                    '.'
            )
        }

        return records
    } catch (err) {
        console.warn(
            `[telemetry] read failed for ${sanitizeForLog(p)}: ${sanitizeForLog(err)}`
        )
        return []
    }
}
