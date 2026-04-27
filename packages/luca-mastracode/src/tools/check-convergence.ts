/**
 * check-convergence — track whether successive run-checks invocations are
 * making progress, stalling on the same errors, or have resolved everything.
 *
 * Persists state to `.planning/checks-convergence.json` between runs so the
 * tool can warn the agent when it's spinning on the same set of errors.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONVERGENCE_FILE = '.planning/checks-convergence.json'

export interface ConvergenceState {
    /** Fingerprints from the last run */
    previousFingerprints: string[]
    /** Number of consecutive iterations with the same error set */
    staleIterations: number
    /** Total iteration count */
    totalIterations: number
}

export function readConvergence(): ConvergenceState {
    const p = join(process.cwd(), CONVERGENCE_FILE)
    if (!existsSync(p))
        return {
            previousFingerprints: [],
            staleIterations: 0,
            totalIterations: 0,
        }
    try {
        return JSON.parse(readFileSync(p, 'utf-8'))
    } catch {
        return {
            previousFingerprints: [],
            staleIterations: 0,
            totalIterations: 0,
        }
    }
}

export function writeConvergence(state: ConvergenceState): void {
    const dir = join(process.cwd(), '.planning')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(
        join(process.cwd(), CONVERGENCE_FILE),
        JSON.stringify(state, null, 2),
        'utf-8'
    )
}

export function assessConvergence(
    currentFingerprints: string[],
    prev: ConvergenceState
): {
    convergence: 'converging' | 'stalled' | 'resolved'
    newState: ConvergenceState
} {
    const prevSet = new Set(prev.previousFingerprints)

    // No errors → resolved
    if (currentFingerprints.length === 0) {
        return {
            convergence: 'resolved',
            newState: {
                previousFingerprints: [],
                staleIterations: 0,
                totalIterations: prev.totalIterations + 1,
            },
        }
    }

    // Compute overlap
    const overlap = currentFingerprints.filter((fp) => prevSet.has(fp))
    const overlapRatio =
        prev.previousFingerprints.length > 0
            ? overlap.length / prev.previousFingerprints.length
            : 0

    // If all errors are the same → stalling
    if (
        overlapRatio >= 1.0 &&
        currentFingerprints.length >= prev.previousFingerprints.length
    ) {
        const staleIterations = prev.staleIterations + 1
        return {
            convergence: staleIterations >= 2 ? 'stalled' : 'converging',
            newState: {
                previousFingerprints: currentFingerprints,
                staleIterations,
                totalIterations: prev.totalIterations + 1,
            },
        }
    }

    // Error count is decreasing or fingerprints changed → converging
    return {
        convergence: 'converging',
        newState: {
            previousFingerprints: currentFingerprints,
            staleIterations: 0,
            totalIterations: prev.totalIterations + 1,
        },
    }
}
