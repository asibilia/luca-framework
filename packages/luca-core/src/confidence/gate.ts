/**
 * Confidence gate — pure bucketing of confidence entries into gate actions.
 *
 * Given a set of execution/planning-time confidence entries, sort each into
 * exactly one of three buckets — `auto` (proceed silently), `research`
 * (resolve via automated research), or `ask` (escalate to a human).
 *
 * The bucketing is a total branch: every entry lands in exactly one bucket.
 * Precedence (top-down), per the locked decisions in
 * `01-confidence-gate-substrate/context.md`:
 *   1. explicit `entry.resolution` set → that bucket (override wins)
 *   2. `confidence === 'high'`   → `auto`
 *   3. `confidence === 'medium'` → `auto`
 *   4. `confidence === 'low'` && `researchable === true` → `research`
 *   5. otherwise (e.g. `low` with `researchable` absent/false) → `ask`
 *      (fail-toward-human, per the fail-closed gate convention)
 *
 * Pure: no IO, no clock, no randomness. Takes already-parsed entries.
 */
import type { ConfidenceEntry } from './schemas.ts'

/** Entries grouped by gate action, with per-bucket counts. */
export interface ConfidenceGateActions {
    /** Entries that may proceed without intervention. */
    auto: ConfidenceEntry[]
    /** Entries that can be resolved by automated research. */
    research: ConfidenceEntry[]
    /** Entries that require human attention. */
    ask: ConfidenceEntry[]
    /** Bucket lengths, for cheap orchestrator inspection. */
    counts: { auto: number; research: number; ask: number }
}

/**
 * Bucket confidence entries into gate actions. Total over its input — every
 * entry is placed in exactly one bucket, falling through to `ask` when no
 * higher-precedence rule matches.
 */
export function selectConfidenceGateActions(
    entries: ConfidenceEntry[]
): ConfidenceGateActions {
    const auto: ConfidenceEntry[] = []
    const research: ConfidenceEntry[] = []
    const ask: ConfidenceEntry[] = []

    for (const entry of entries) {
        if (entry.resolution) {
            if (entry.resolution === 'auto') auto.push(entry)
            else if (entry.resolution === 'research') research.push(entry)
            else if (entry.resolution === 'ask') ask.push(entry)
            else { const _exhaustive: never = entry.resolution; ask.push(entry) } // fail-toward-human
        } else if (entry.confidence === 'high') {
            auto.push(entry)
        } else if (entry.confidence === 'medium') {
            auto.push(entry)
        } else if (entry.confidence === 'low' && entry.researchable === true) {
            research.push(entry)
        } else {
            ask.push(entry)
        }
    }

    return {
        auto,
        research,
        ask,
        counts: { auto: auto.length, research: research.length, ask: ask.length },
    }
}
