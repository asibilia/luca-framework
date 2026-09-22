/**
 * Outcome KPI computation — pure aggregation over per-phase artifacts,
 * bucketed by triage complexity.
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
 *
 * ## Retired KPIs
 * `meanReworkIterations` and `reEntryRate` were derived from
 * `signal.satisfaction` source:outcome telemetry records. Satisfaction signals
 * retired with the local telemetry sink (LangSmith is the replacement); both
 * KPIs went with them. The two artifact-derived KPIs above are unaffected —
 * they never read telemetry.
 *
 * ## Attribution
 * A phase dir slug `<NN>-<name>` maps to a complexity bucket by stripping the
 * leading `NN-` and matching `RoadmapPhase.name`. Phases that cannot be
 * attributed (no roadmap match) are NOT silently dropped — they increment the
 * top-level `unattributed` tally.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
    getConfidenceSummary,
    readConfidenceJournal,
} from '../confidence/index.ts'
import { LUCA_DIR_ROOT } from '../luca-dir/index.ts'
import type { RoadmapPhase } from '../state/index.ts'
import { readVerificationResult } from '../verification/index.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-complexity outcome KPI bucket. */
export interface OutcomeKpiBucket {
    /** low-confidence decisions / total confidence decisions across the bucket's phases. */
    lowConfidenceRatio: number
    /** phases whose single verify.json record is PASS / phases in bucket. */
    firstPassVerifyRate: number
    /** number of phases attributed to this bucket. */
    sampleSize: number
}

/** Result of {@link computeOutcomeKpis}: per-complexity buckets + unattributed tally. */
export interface OutcomeKpis {
    /** Keyed by complexity level (e.g. "SIMPLE", "MODERATE"). */
    buckets: Record<string, OutcomeKpiBucket>
    /** Phases that could not be attributed to a bucket. */
    unattributed: {
        /** Phase dirs with no roadmap-name match. */
        phases: number
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute complexity-bucketed outcome KPIs over the repo's `.luca/` artifacts.
 *
 * Pure read — performs no writes. Phases that cannot be attributed to a
 * roadmap complexity are tallied under `unattributed` rather than dropped.
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

    // Per-bucket accumulators.
    interface Accumulator {
        confLow: number
        confTotal: number
        verifyPhases: number
        firstPassPhases: number
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
                sampleSize: 0,
            }
            accumulators.set(complexity, acc)
        }
        return acc
    }

    let unattributedPhases = 0

    for (const slug of listPhaseSlugs({ cwd })) {
        const complexity = nameToComplexity.get(slugToName({ slug }))
        if (!complexity) {
            unattributedPhases++
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
    }

    const buckets: Record<string, OutcomeKpiBucket> = {}
    for (const [complexity, acc] of accumulators) {
        buckets[complexity] = {
            lowConfidenceRatio:
                acc.confTotal > 0 ? acc.confLow / acc.confTotal : 0,
            firstPassVerifyRate:
                acc.verifyPhases > 0
                    ? acc.firstPassPhases / acc.verifyPhases
                    : 0,
            sampleSize: acc.sampleSize,
        }
    }

    return {
        buckets,
        unattributed: {
            phases: unattributedPhases,
        },
    }
}
