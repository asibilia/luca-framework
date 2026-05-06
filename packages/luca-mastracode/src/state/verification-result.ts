/**
 * Structured verification output — `.planning/verification-result.json`
 *
 * Replaces prose-based verification with deterministic JSON the orchestrator
 * can read without parsing free text. The verifier writes results; the review
 * mode reads them for audit aggregation; finalize mode reads them for
 * milestone validation.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import {
    VERIFICATION_HISTORY_PATH,
    phasePath,
} from '../util/phase-paths.js'
import { readLucaState } from './luca-store.js'
import { getCurrentRunId } from './session-ledger.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerificationCriterion {
    /** Stable identifier (e.g. "ac-01", "test-pass") */
    criterionId: string
    /** Human-readable description */
    description: string
    /** Whether the criterion is satisfied */
    met: boolean
    /** File/line/test evidence supporting the verdict */
    evidence: string
    /** If not met, what's missing */
    gap?: string
    /** Whether this criterion blocks proceeding */
    blocking: boolean
}

export interface CheckResult {
    name: string
    status: 'pass' | 'fail' | 'skip' | 'timeout'
    errorCount: number
    warningCount: number
    /** Duration in milliseconds */
    durationMs?: number
}

export interface VerificationResult {
    /** ISO 8601 timestamp */
    timestamp: string
    /**
     * Run that produced this result. Stamped on write; validated on read.
     * A stale result from a prior run (mismatched runId) is treated as
     * absent so it can't satisfy wave/phase guards in the new run.
     * Optional for back-compat with results written before runId stamping.
     */
    runId?: string
    /** Pipeline phase (e.g. "Phase 1: Setup") */
    phase?: string
    /** Wave/iteration number */
    wave: number
    /** quick | full */
    mode: 'quick' | 'full'
    /** Overall verdict */
    status: 'PASS' | 'FAIL' | 'STALLED'
    /** Per-criterion results */
    criteria: VerificationCriterion[]
    /** Automated check results */
    checks: CheckResult[]
    /** Convergence assessment */
    convergence: 'converging' | 'stalled' | 'resolved'
    /** Error fingerprints for tracking across iterations */
    errorFingerprints: string[]
    /** Recommendation to the orchestrator */
    recommendation: 'proceed' | 'fix' | 'escalate'
    /** Free-form notes from the verifier */
    notes?: string
}

// ---------------------------------------------------------------------------
// File path
// ---------------------------------------------------------------------------

/**
 * Resolve the per-phase `verification-result.json` path.
 *
 * Read at call time (not module load) so it tracks the live
 * `currentPhaseSlug` — which is set during triage and referenced from this
 * point until phase teardown. When slug is absent (legacy in-flight runs),
 * `phasePath` falls back to `.planning/` root.
 */
function resultPath(): string {
    const slug = readLucaState().currentPhaseSlug
    return phasePath('verification-result.json', slug)
}

/** `.planning/verification-history.jsonl` — root, cross-wave (Decision #4). */
function historyPath(): string {
    return VERIFICATION_HISTORY_PATH()
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/**
 * Read the latest verification result. Returns null if no result exists,
 * if the file is unparseable, or if the stamped `runId` doesn't match the
 * current run (defense against a prior run's stale snapshot satisfying
 * the new run's wave/phase guards). Results without a `runId` field are
 * treated as legacy and accepted for back-compat.
 */
export function readVerificationResult(): VerificationResult | null {
    const p = resultPath()
    if (!existsSync(p)) return null
    try {
        const parsed = JSON.parse(
            readFileSync(p, 'utf-8'),
        ) as VerificationResult
        if (
            typeof parsed.runId === 'string' &&
            parsed.runId.length > 0 &&
            parsed.runId !== getCurrentRunId()
        ) {
            return null
        }
        return parsed
    } catch {
        return null
    }
}

/**
 * Write a verification result (overwrites latest, appends to history).
 * Stamps the current `runId` so a stale snapshot from a prior run can't
 * silently satisfy the new run's wave/phase guards.
 */
export function writeVerificationResult(result: VerificationResult): void {
    const stamped: VerificationResult = {
        ...result,
        runId: result.runId ?? getCurrentRunId(),
    }
    // resultPath() routes through phasePath() which ensures the parent dir
    // exists (creating .planning/phases/<slug>/ or .planning/ as needed),
    // so no separate ensurePlanningDir() call is required here.
    writeFileSync(resultPath(), JSON.stringify(stamped, null, 2), 'utf-8')
    // Append to history (one JSON object per line)
    const line = JSON.stringify(stamped) + '\n'
    const hp = historyPath()
    if (existsSync(hp)) {
        const existing = readFileSync(hp, 'utf-8')
        writeFileSync(hp, existing + line, 'utf-8')
    } else {
        writeFileSync(hp, line, 'utf-8')
    }
}

/**
 * Read all verification history entries.
 */
export function readVerificationHistory(): VerificationResult[] {
    const hp = historyPath()
    if (!existsSync(hp)) return []
    try {
        return readFileSync(hp, 'utf-8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
    } catch {
        return []
    }
}

/**
 * Find a specific criterion in the verification history by wave + criterionId.
 * Returns the matching criterion (with the result it belongs to) or null.
 *
 * Used by `manageTodos(move → done)` to verify that a todo's claimed
 * verification reference actually exists and was met.
 *
 * Pass a preloaded `history` array when validating many criteria in a row
 * (e.g. `move-batch`) to avoid re-reading and re-parsing the JSONL file
 * once per item.
 */
export function findCriterion({
    criterionId,
    wave,
    history,
}: {
    criterionId: string
    wave: number
    history?: VerificationResult[]
}): {
    criterion: VerificationCriterion
    result: VerificationResult
} | null {
    const records = history ?? readVerificationHistory()
    // Iterate newest → oldest so the most recent verdict wins.
    for (let i = records.length - 1; i >= 0; i--) {
        const r = records[i]
        if (!r || r.wave !== wave) continue
        const c = r.criteria.find((cc) => cc.criterionId === criterionId)
        if (c) return { criterion: c, result: r }
    }
    return null
}

/**
 * Aggregate verification results for milestone validation.
 * Returns overall pass/fail and summary stats.
 */
export function aggregateVerificationResults(results: VerificationResult[]): {
    totalWaves: number
    passCount: number
    failCount: number
    stalledCount: number
    allCriteriaMet: boolean
    blockingGaps: Array<{ criterionId: string; gap: string; wave: number }>
} {
    const totalWaves = results.length
    const passCount = results.filter((r) => r.status === 'PASS').length
    const failCount = results.filter((r) => r.status === 'FAIL').length
    const stalledCount = results.filter((r) => r.status === 'STALLED').length

    // Check latest result for blocking gaps
    const latest = results[results.length - 1]
    const blockingGaps = latest
        ? latest.criteria
              .filter((c) => !c.met && c.blocking)
              .map((c) => ({
                  criterionId: c.criterionId,
                  gap: c.gap ?? 'Unknown',
                  wave: latest.wave,
              }))
        : []

    const allCriteriaMet = latest
        ? latest.criteria.filter((c) => c.blocking).every((c) => c.met)
        : false

    return {
        totalWaves,
        passCount,
        failCount,
        stalledCount,
        allCriteriaMet,
        blockingGaps,
    }
}
