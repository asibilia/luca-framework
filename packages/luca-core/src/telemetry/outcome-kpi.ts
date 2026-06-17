/**
 * Outcome KPI computation — pure aggregation over per-phase artifacts and the
 * per-run telemetry log, bucketed by triage complexity.
 *
 * Persisted at milestone close as `metric:outcome-kpi-<version>-<complexity>`
 * memories (see the finalize mode body directive) so cross-run outcome trends
 * survive between runs (REQ-14). Compute is exposed read-only via
 * `luca telemetry kpi --json`; persistence is an LLM-executed finalize body
 * directive — this module performs NO writes.
 *
 * ## Sources (all per-phase, read-only)
 *   - `confidence.jsonl` → `lowConfidenceRatio` (low decisions / total).
 *   - `verify.json` (the single per-phase `VerificationResult`, read via
 *     `readVerificationResult`) → `firstPassVerifyRate`: a phase is first-pass
 *     when its verify record has `status == 'PASS'`; any non-PASS
 *     (FAIL/STALLED) counts as not-first-pass.
 *   - `.luca/telemetry/<run>.jsonl` `signal.satisfaction` source:outcome
 *     records → `meanReworkIterations` + `reEntryRate` (grouped by record
 *     `slug`). The synthetic `pr-outcomes.jsonl` is excluded.
 *
 * ## Attribution
 * A phase dir slug `<NN>-<name>` maps to a complexity bucket by stripping the
 * leading `NN-` and matching `RoadmapPhase.name`. Phases / records that cannot
 * be attributed (no roadmap match, or a telemetry record with `slug: null`)
 * are NOT silently dropped — they increment the top-level `unattributed` tally.
 *
 * Forward-only: telemetry written before the producer was stamped with
 * `--slug`/`--complexity` carries `slug: null` and lands in `unattributed`;
 * the KPIs are forward trends.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { LUCA_DIR_ROOT } from '../luca-dir/index.ts'
import {
    getConfidenceSummary,
    readConfidenceJournal,
} from '../confidence/index.ts'
import type { RoadmapPhase } from '../state/index.ts'
import { readVerificationResult } from '../verification/index.ts'

import { readTelemetry } from './telemetry.ts'
import type { TelemetryRecord } from './schemas.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-complexity outcome KPI bucket. */
export interface OutcomeKpiBucket {
    /** low-confidence decisions / total confidence decisions across the bucket's phases. */
    lowConfidenceRatio: number
    /** phases whose single verify.json record is PASS / phases in bucket. */
    firstPassVerifyRate: number
    /** mean over bucket phases of negative source:outcome records at step ∈ {checks,verify}. */
    meanReworkIterations: number
    /** phases with ≥1 negative source:outcome record / phases in bucket. */
    reEntryRate: number
    /** number of phases attributed to this bucket. */
    sampleSize: number
}

/** Result of {@link computeOutcomeKpis}: per-complexity buckets + unattributed tally. */
export interface OutcomeKpis {
    /** Keyed by complexity level (e.g. "SIMPLE", "MODERATE"). */
    buckets: Record<string, OutcomeKpiBucket>
    /** Phases + telemetry records that could not be attributed to a bucket. */
    unattributed: {
        /** Phase dirs with no roadmap-name match. */
        phases: number
        /** signal.satisfaction source:outcome records with slug:null or no roadmap match. */
        records: number
    }
}

export interface ComputeOutcomeKpisOptions {
    /** Repo root — `.luca/` is resolved relative to this. */
    cwd: string
    /** Roadmap phases (carry name + complexity); the slug→complexity source. */
    roadmap: RoadmapPhase[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** The synthetic telemetry file that is NOT a real run log; never aggregated. */
const PR_OUTCOMES_RUN_ID = 'pr-outcomes'

/** Steps whose negative outcome counts as a rework iteration. */
const REWORK_STEPS = new Set(['checks', 'verify'])

/**
 * Canonicalize a name or slug to lowercase kebab-case so a roadmap
 * `phase.name` (which may be prose, e.g. `"Implement OAuth"`) and a phase dir
 * slug (always lowercase-kebab per LUCA_DIR_CONTRACT, e.g. `"implement-oauth"`)
 * compare equal. Without this, any phase whose name carries spaces or
 * uppercase falls through to `unattributed`.
 */
function toKebab(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

/** Strip a leading zero-padded `NN-` from a phase dir slug, canonicalized. */
function slugToName({ slug }: { slug: string }): string {
    return toKebab(slug.replace(/^\d{2,}-/, ''))
}

/** List phase dir slugs under `.luca/phases/`. */
function listPhaseSlugs({ cwd }: { cwd: string }): string[] {
    const phasesDir = join(cwd, LUCA_DIR_ROOT, 'phases')
    if (!existsSync(phasesDir)) return []
    return readdirSync(phasesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
}

/**
 * Read every real run's telemetry records, excluding the synthetic
 * `pr-outcomes.jsonl`. Returns the flat record list.
 */
function readAllRunRecords({ cwd }: { cwd: string }): TelemetryRecord[] {
    const telemetryDir = join(cwd, LUCA_DIR_ROOT, 'telemetry')
    if (!existsSync(telemetryDir)) return []
    const records: TelemetryRecord[] = []
    for (const entry of readdirSync(telemetryDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
        const runId = entry.name.slice(0, -'.jsonl'.length)
        if (runId === PR_OUTCOMES_RUN_ID) continue
        records.push(...readTelemetry({ cwd, runId }))
    }
    return records
}

/** A source:outcome satisfaction record carrying a usable slug. */
function isOutcomeRecord({ record }: { record: TelemetryRecord }): boolean {
    return (
        record.kind === 'signal.satisfaction' &&
        (record.meta as { source?: unknown }).source === 'outcome'
    )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute complexity-bucketed outcome KPIs over the repo's `.luca/` artifacts.
 *
 * Pure read — performs no writes. Phases / records that cannot be attributed to
 * a roadmap complexity are tallied under `unattributed` rather than dropped.
 */
export function computeOutcomeKpis(
    opts: ComputeOutcomeKpisOptions
): OutcomeKpis {
    const { cwd, roadmap } = opts

    // name → complexity (skip entries without a complexity classification).
    const nameToComplexity = new Map<string, string>()
    for (const phase of roadmap) {
        // Key by canonical kebab so a prose/uppercase roadmap name (e.g.
        // "Implement OAuth") still matches the kebab dir slug.
        if (phase.complexity) {
            nameToComplexity.set(toKebab(phase.name), phase.complexity)
        }
    }

    // Group outcome telemetry records by slug; tally slug:null / unmatched.
    const outcomeRecordsBySlug = new Map<string, TelemetryRecord[]>()
    let unattributedRecords = 0
    for (const record of readAllRunRecords({ cwd })) {
        if (!isOutcomeRecord({ record })) continue
        if (!record.slug) {
            unattributedRecords++
            continue
        }
        const list = outcomeRecordsBySlug.get(record.slug)
        if (list) list.push(record)
        else outcomeRecordsBySlug.set(record.slug, [record])
    }

    // Per-bucket accumulators.
    interface Accumulator {
        confLow: number
        confTotal: number
        verifyPhases: number
        firstPassPhases: number
        reworkCounts: number[]
        reEntryPhases: number
        sampleSize: number
    }
    const accumulators = new Map<string, Accumulator>()
    const accumulatorFor = (complexity: string): Accumulator => {
        let acc = accumulators.get(complexity)
        if (!acc) {
            acc = {
                confLow: 0,
                confTotal: 0,
                verifyPhases: 0,
                firstPassPhases: 0,
                reworkCounts: [],
                reEntryPhases: 0,
                sampleSize: 0,
            }
            accumulators.set(complexity, acc)
        }
        return acc
    }

    let unattributedPhases = 0
    const slugsWithOutcomeRecords = new Set(outcomeRecordsBySlug.keys())

    for (const slug of listPhaseSlugs({ cwd })) {
        const complexity = nameToComplexity.get(slugToName({ slug }))
        if (!complexity) {
            unattributedPhases++
            // Any outcome records for this slug are also unattributable.
            const orphaned = outcomeRecordsBySlug.get(slug)
            if (orphaned) {
                unattributedRecords += orphaned.length
                slugsWithOutcomeRecords.delete(slug)
            }
            continue
        }
        const acc = accumulatorFor(complexity)
        acc.sampleSize++

        // --- lowConfidenceRatio ---
        const confSummary = getConfidenceSummary(
            readConfidenceJournal({ cwd, slug })
        )
        acc.confLow += confSummary.low
        acc.confTotal += confSummary.total

        // --- firstPassVerifyRate (single verify.json record == PASS) ---
        const verify = readVerificationResult({ cwd, slug })
        if (verify) {
            acc.verifyPhases++
            if (verify.status === 'PASS') acc.firstPassPhases++
        }

        // --- meanReworkIterations + reEntryRate ---
        const outcomeRecords = outcomeRecordsBySlug.get(slug) ?? []
        slugsWithOutcomeRecords.delete(slug)
        const negativeReworkCount = outcomeRecords.filter((r) => {
            const meta = r.meta as { valence?: unknown; step?: unknown }
            return (
                meta.valence === 'negative' &&
                typeof meta.step === 'string' &&
                REWORK_STEPS.has(meta.step)
            )
        }).length
        acc.reworkCounts.push(negativeReworkCount)
        const hasNegative = outcomeRecords.some(
            (r) => (r.meta as { valence?: unknown }).valence === 'negative'
        )
        if (hasNegative) acc.reEntryPhases++
    }

    // Outcome records whose slug has no phase dir at all are unattributable.
    for (const slug of slugsWithOutcomeRecords) {
        unattributedRecords += outcomeRecordsBySlug.get(slug)?.length ?? 0
    }

    const buckets: Record<string, OutcomeKpiBucket> = {}
    for (const [complexity, acc] of accumulators) {
        const reworkSum = acc.reworkCounts.reduce((a, b) => a + b, 0)
        buckets[complexity] = {
            lowConfidenceRatio:
                acc.confTotal > 0 ? acc.confLow / acc.confTotal : 0,
            firstPassVerifyRate:
                acc.verifyPhases > 0
                    ? acc.firstPassPhases / acc.verifyPhases
                    : 0,
            meanReworkIterations:
                acc.reworkCounts.length > 0
                    ? reworkSum / acc.reworkCounts.length
                    : 0,
            reEntryRate:
                acc.sampleSize > 0 ? acc.reEntryPhases / acc.sampleSize : 0,
            sampleSize: acc.sampleSize,
        }
    }

    return {
        buckets,
        unattributed: {
            phases: unattributedPhases,
            records: unattributedRecords,
        },
    }
}
