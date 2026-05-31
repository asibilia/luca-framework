/**
 * Generate a base36 run identifier of the form `run_<timestamp36>_<random36>`.
 *
 * Intentionally not a real ULID — uniqueness within a single `.luca/`
 * directory is all that is required, not lexicographic monotonicity or
 * 128-bit collision resistance. The output satisfies the `RunIdSchema`
 * exported from `@alecsibilia/luca-core/luca-dir`.
 *
 * Ported from luca-mastracode `state/session-ledger.ts` (`generateRunId`).
 */
export function generateRunId(): string {
    const ts = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 10)
    return `run_${ts}_${rand}`
}
