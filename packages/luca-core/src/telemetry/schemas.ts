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
    | 'recall.utilization'
    | 'review.iteration'
    | 'signal.satisfaction'
    | 'signal.failure-dump'
    | 'classifier.override'
    | 'pr.created'
    | 'pr.outcome'
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
 * Provenance of a classifier override — why the pipeline's automatic
 * classification was superseded.
 *
 * - `cli-flag`: operator passed an explicit CLI flag.
 * - `force-complex`: complexity was forced up to COMPLEX.
 * - `human-ask`: a human gate/ask resolved the classification.
 * - `heuristic-promotion`: a heuristic promoted the classification.
 */
export const OverrideSourceSchema = z.enum([
    'cli-flag',
    'force-complex',
    'human-ask',
    'heuristic-promotion',
])

/** Inferred type for {@link OverrideSourceSchema}. */
export type OverrideSource = z.infer<typeof OverrideSourceSchema>

/**
 * ADVISORY shape for `signal.satisfaction` event `meta`.
 *
 * Fail-safe by design: `.passthrough()` ensures extra keys never cause a
 * rejection. This schema documents the expected shape for IDE/tooling and
 * MUST NOT be wired into any throwing validation path (no `.parse()` in emit).
 */
export const SatisfactionSignalMetaSchema = z
    .object({
        source: z.enum(['gate-ask', 'oversight-pause', 'outcome']),
        valence: z.enum(['positive', 'negative', 'neutral']),
        step: z.string().optional(),
        detail: z.string().optional(),
    })
    .passthrough()

/** Inferred type for {@link SatisfactionSignalMetaSchema}. */
export type SatisfactionSignalMeta = z.infer<
    typeof SatisfactionSignalMetaSchema
>

/**
 * ADVISORY shape for `classifier.override` event `meta`.
 *
 * Fail-safe by design: `.passthrough()` ensures extra keys never cause a
 * rejection. Documentation-only; MUST NOT be wired into a throwing path.
 */
export const ClassifierOverrideMetaSchema = z
    .object({
        classifier: z.string(),
        from: z.string(),
        to: z.string(),
        source: OverrideSourceSchema,
    })
    .passthrough()

/** Inferred type for {@link ClassifierOverrideMetaSchema}. */
export type ClassifierOverrideMeta = z.infer<
    typeof ClassifierOverrideMetaSchema
>

/**
 * ADVISORY shape for `signal.failure-dump` event `meta`.
 *
 * Fail-safe by design: `.passthrough()` ensures extra keys never cause a
 * rejection. Documentation-only; MUST NOT be wired into a throwing path.
 */
export const FailureDumpMetaSchema = z
    .object({
        step: z.string().optional(),
        reason: z.string().optional(),
        dump: z.string().optional(),
        dumpRef: z.string().optional(),
    })
    .passthrough()

/** Inferred type for {@link FailureDumpMetaSchema}. */
export type FailureDumpMeta = z.infer<typeof FailureDumpMetaSchema>

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
 * ADVISORY shape for `pr.outcome` event `meta`.
 *
 * Records the post-merge (or post-revert) outcome of a pull request so the
 * aggregator can correlate it back to the originating run via the `pr.created`
 * run→PR map (join key `prNumber`). The `pr.outcome` record itself rides a
 * fixed synthetic runId (`pr-outcomes`) because the merge/revert event happens
 * outside the originating session; `originRunId` carries the originating run
 * for the correlation.
 *
 * Fail-safe by design: `.passthrough()` ensures extra keys never cause a
 * rejection. Documentation-only; MUST NOT be wired into a throwing path.
 */
export const PrOutcomeMetaSchema = z
    .object({
        prNumber: z.number(),
        result: z.enum(['merged', 'reverted']),
        reviewRounds: z.number(),
        timeToMergeMs: z.number(),
        branch: z.string().optional(),
        issue: z.number().optional(),
        originRunId: z.string().optional(),
    })
    .passthrough()

/** Inferred type for {@link PrOutcomeMetaSchema}. */
export type PrOutcomeMeta = z.infer<typeof PrOutcomeMetaSchema>
