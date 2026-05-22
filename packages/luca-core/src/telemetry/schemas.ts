/**
 * Telemetry record schema — v1 (LOCKED).
 *
 * The append-only JSONL event log at `.luca/telemetry/<runId>.jsonl` records
 * pipeline-mode and PLAN.md-phase boundaries; it is consumed by the
 * `/luca-telemetry-report` aggregator skill.
 *
 * ## Schema contract (v1 — LOCKED)
 *
 * 1. Every record carries `v: 1`.
 * 2. Fields may be ADDED in the same major version. Never rename or remove.
 * 3. Consumers MUST ignore unknown fields (forward-compatible reads).
 * 4. Breaking changes bump `v: 2` and require a migration window where
 *    consumers handle both versions.
 *
 * Ported from luca-mastracode `state/telemetry.ts`.
 */
import { z } from 'zod'

/**
 * Known event kinds at schema v1.
 *
 * Typed as `union | string` so future telemetry consumers (subagent.*,
 * recall.*, review.*, …) can extend the set without amending this file.
 */
export type TelemetryKind =
    | 'phase.start'
    | 'phase.end'
    | 'wave.start'
    | 'wave.end'
    | 'mode.start'
    | 'mode.end'
    | 'subagent.invoke'
    | 'subagent.complete'
    | 'subagent.cancelled'
    | 'recall.hit'
    | 'recall.miss'
    | 'review.iteration'
    | (string & {})

export interface TelemetryRecord {
    /** Schema version. Locked at 1; bump to 2 only for breaking changes. */
    v: 1
    /** Event timestamp (ISO 8601). */
    ts: string
    /** Run identifier; matches filename `.luca/telemetry/<runId>.jsonl`. */
    runId: string
    /** Event kind — see {@link TelemetryKind}. */
    kind: TelemetryKind
    /** Phase name from the roadmap; null when no phase is active. */
    phase: string | null
    /** Phase slug (`.luca/phases/<slug>/`); null pre-triage. */
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

/**
 * Zod schema — defensive validation before every write and after every read.
 */
export const TelemetryRecordSchema: z.ZodType<TelemetryRecord> = z.object({
    v: z.literal(1),
    // ISO 8601 datetime — aggregator consumers parse durations from these.
    ts: z.iso.datetime(),
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
