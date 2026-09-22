/**
 * Telemetry record schema — v1 (LOCKED).
 *
 * ## Scope — the MINIMAL sink
 *
 * `.luca/telemetry/<runId>.jsonl` used to be a general-purpose pipeline event
 * log. That role is now LangSmith's (see
 * `luca-cli/src/init/helpers/enrich-trace-metadata.ts`, gated on
 * `TRACE_TO_LANGSMITH`). What remains here is the deliberate residue —
 * the two things LangSmith cannot observe:
 *
 *  1. **MuninnDB recall quality** (`recall.hit` / `recall.miss` /
 *     `recall.utilization`). Recall happens inside an MCP tool call; the trace
 *     records that a call happened, never whether the recalled engrams were
 *     any good. This is measured nowhere else.
 *  2. **The `trace-insights` Stage A5 join input.** Traces carry no runId, so
 *     the LangSmith→pipeline join is an analysis-time join over
 *     `.luca/ledger.jsonl` (intervals) and `.luca/telemetry/<runId>.jsonl`
 *     (slug/wave resolution). Retiring this file would remove half the input
 *     of the very skill meant to replace it.
 *
 * Everything else — phase/wave/mode boundaries, subagent correlation pairing,
 * satisfaction + failure-dump signals, classifier overrides, PR outcomes —
 * is retired in favour of LangSmith traces and `.luca/ledger.jsonl`.
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
 * Narrowed to the retained recall family. Still typed as `union | string` so
 * historical logs (which carry retired kinds such as `phase.start` or
 * `signal.satisfaction`) continue to READ without error — the schema never
 * validated `kind` as an enum, and forward-compatible reads are contract
 * clause 3. New producers must emit only the recall kinds.
 */
export type TelemetryKind =
    | 'recall.hit'
    | 'recall.miss'
    | 'recall.utilization'
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

/**
 * ADVISORY shape for `recall.utilization` event `meta`.
 *
 * Records which recalled engrams (by concept ULID) were associated with a
 * pipeline step's outcome — feeding recall outcome attribution.
 *
 * Fail-safe by design: `.passthrough()` ensures extra keys never cause a
 * rejection. Documentation-only; MUST NOT be wired into a throwing path.
 */
export const RecallUtilizationMetaSchema = z
    .object({
        recalledIds: z.array(z.string()).optional(),
        outcome: z.string().optional(),
        step: z.string().optional(),
    })
    .passthrough()

/** Inferred type for {@link RecallUtilizationMetaSchema}. */
export type RecallUtilizationMeta = z.infer<typeof RecallUtilizationMetaSchema>

/**
 * ADVISORY shape for `recall.hit` / `recall.miss` event `meta`.
 *
 * Fail-safe by design: `.passthrough()` ensures extra keys never cause a
 * rejection. Documentation-only; MUST NOT be wired into a throwing path.
 */
export const RecallOutcomeMetaSchema = z
    .object({
        query: z.string().optional(),
        resultCount: z.number().optional(),
        verifiedCount: z.number().optional(),
        vault: z.string().optional(),
        callerMode: z.string().optional(),
        durationMs: z.number().optional(),
        recalledIds: z.array(z.string()).optional(),
    })
    .passthrough()

/** Inferred type for {@link RecallOutcomeMetaSchema}. */
export type RecallOutcomeMeta = z.infer<typeof RecallOutcomeMetaSchema>
