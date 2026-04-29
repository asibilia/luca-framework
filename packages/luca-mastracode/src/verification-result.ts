/**
 * Structured verification output — `.planning/verification-result.json`
 *
 * Replaces prose-based verification with deterministic JSON the orchestrator
 * can read without parsing free text. The verifier writes results; the review
 * mode reads them for audit aggregation; finalize mode reads them for
 * milestone validation.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

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

const RESULT_FILE = '.planning/verification-result.json'
const HISTORY_FILE = '.planning/verification-history.jsonl'

function resultPath(): string {
    return join(process.cwd(), RESULT_FILE)
}

function historyPath(): string {
    return join(process.cwd(), HISTORY_FILE)
}

function ensurePlanningDir(): void {
    const dir = join(process.cwd(), '.planning')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/**
 * Read the latest verification result. Returns null if no result exists.
 */
export function readVerificationResult(): VerificationResult | null {
    const p = resultPath()
    if (!existsSync(p)) return null
    try {
        return JSON.parse(readFileSync(p, 'utf-8'))
    } catch {
        return null
    }
}

/**
 * Write a verification result (overwrites latest, appends to history).
 */
export function writeVerificationResult(result: VerificationResult): void {
    ensurePlanningDir()
    writeFileSync(resultPath(), JSON.stringify(result, null, 2), 'utf-8')
    // Append to history (one JSON object per line)
    const line = JSON.stringify(result) + '\n'
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
 */
export function findCriterion({
    criterionId,
    wave,
}: {
    criterionId: string
    wave: number
}): {
    criterion: VerificationCriterion
    result: VerificationResult
} | null {
    const history = readVerificationHistory()
    // Iterate newest → oldest so the most recent verdict wins.
    for (let i = history.length - 1; i >= 0; i--) {
        const r = history[i]
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
