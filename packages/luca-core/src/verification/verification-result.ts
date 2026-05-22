/**
 * Verification-result reader / writer + pure aggregation helpers.
 *
 * The verifier writes one `verify.json` per phase at
 * `.luca/phases/<slug>/verify.json`; downstream steps read it deterministically.
 *
 * Ported from luca-mastracode `state/verification-result.ts`. Changes from the
 * mastracode original:
 *   - `.planning/verification-result.json` → `.luca/phases/<slug>/verify.json`
 *     (via `phasePathFor`); `slug` and `cwd` are explicit parameters
 *     (mastracode read the live slug from state and used `process.cwd()`).
 *   - The run-staleness guard takes an explicit `currentRunId` rather than
 *     calling `getCurrentRunId()`.
 *   - `findCriterion` / `aggregateVerificationResults` are pure over a
 *     caller-supplied `VerificationResult[]`.
 *
 * Not ported — no `.luca/` equivalent: `verification-history.jsonl`
 * (`readVerificationHistory` + the auto-read inside `findCriterion`). The
 * `.luca/` contract has no cross-run history file at root or in a phase dir;
 * cross-run verification events flow through the session ledger instead.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { phasePathFor } from '../luca-dir/index.ts'

import {
    VerificationResultSchema,
    type VerificationCriterion,
    type VerificationResult,
} from './schemas.ts'

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

/**
 * Read the verification result for a phase.
 *
 * Returns `null` when no result exists, the file is unparseable or
 * schema-invalid, or — when `currentRunId` is supplied — the stamped `runId`
 * belongs to a different run (stale-snapshot defense). A result with no
 * `runId` field is treated as legacy and accepted.
 */
export function readVerificationResult(opts: {
    cwd: string
    slug: string
    currentRunId?: string
}): VerificationResult | null {
    const p = join(opts.cwd, phasePathFor(opts.slug, 'verify'))
    if (!existsSync(p)) return null
    try {
        const parsed = VerificationResultSchema.safeParse(
            JSON.parse(readFileSync(p, 'utf-8'))
        )
        if (!parsed.success) return null
        const result = parsed.data
        if (
            opts.currentRunId &&
            typeof result.runId === 'string' &&
            result.runId.length > 0 &&
            result.runId !== opts.currentRunId
        ) {
            return null
        }
        return result
    } catch {
        return null
    }
}

/**
 * Write the verification result for a phase, overwriting any prior result.
 *
 * Stamps `runId` (preferring an existing `result.runId`, falling back to the
 * supplied `runId`) so a stale snapshot from a prior run cannot silently
 * satisfy the new run's wave/phase guards.
 */
export function writeVerificationResult(opts: {
    cwd: string
    slug: string
    result: VerificationResult
    runId?: string
}): void {
    const stamped: VerificationResult = {
        ...opts.result,
        runId: opts.result.runId ?? opts.runId,
    }
    const p = join(opts.cwd, phasePathFor(opts.slug, 'verify'))
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, `${JSON.stringify(stamped, null, 2)}\n`, 'utf-8')
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Find a criterion across a set of verification results by `criterionId`,
 * optionally constrained to a single `wave`. Results are scanned newest-first
 * (last array element wins) so the most recent verdict is returned.
 */
export function findCriterion(opts: {
    results: VerificationResult[]
    criterionId: string
    wave?: number
}): { criterion: VerificationCriterion; result: VerificationResult } | null {
    for (let i = opts.results.length - 1; i >= 0; i--) {
        const r = opts.results[i]
        if (!r) continue
        if (opts.wave !== undefined && r.wave !== opts.wave) continue
        const criterion = r.criteria.find(
            (c) => c.criterionId === opts.criterionId
        )
        if (criterion) return { criterion, result: r }
    }
    return null
}

/**
 * Aggregate verification results for milestone validation: overall verdict
 * counts plus the blocking gaps of the latest result.
 */
export function aggregateVerificationResults(
    results: VerificationResult[]
): {
    totalWaves: number
    passCount: number
    failCount: number
    stalledCount: number
    allCriteriaMet: boolean
    blockingGaps: Array<{ criterionId: string; gap: string; wave: number }>
} {
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

    return {
        totalWaves: results.length,
        passCount: results.filter((r) => r.status === 'PASS').length,
        failCount: results.filter((r) => r.status === 'FAIL').length,
        stalledCount: results.filter((r) => r.status === 'STALLED').length,
        allCriteriaMet: latest
            ? latest.criteria.filter((c) => c.blocking).every((c) => c.met)
            : false,
        blockingGaps,
    }
}
