/**
 * Golden parity fixtures.
 *
 * The single source of enumerated `(from, to)` pairs the parity + graph
 * harnesses drive over. `ALL_PAIRS` is the full 13x13 cartesian product;
 * `LEGAL_PAIRS` is the 21-edge subset the legacy `PIPELINE_TRANSITIONS`
 * permits. The `EXPECTED_*` counts are tripwires: if the transition table
 * changes shape, these constants force the test author to re-baseline
 * deliberately rather than let a silent drift through.
 */
import { isLegalTransition } from '../configs/pipeline-transitions.ts'
import { PipelineStepValues } from '../constants.ts'
import type { PipelineStep } from '../schemas.ts'
import {
    STEP_TO_STATE_VALUE,
    stateValueToLeaf,
    type PipelineContext,
} from './pipeline-machine.ts'

// Re-export the state-value helpers so the harness has a single import
// surface for everything fixture-related.
export { STEP_TO_STATE_VALUE, stateValueToLeaf }

/** A single enumerated transition pair with its legacy legality. */
export interface TransitionPair {
    from: PipelineStep
    to: PipelineStep
    /** True iff `PIPELINE_TRANSITIONS[from]` includes `to`. */
    legal: boolean
    /** True iff `from === to` (a self-edge — legal or not). */
    selfLoop: boolean
}

/** Full 13x13 cartesian product of steps (169 pairs). */
export const ALL_PAIRS: TransitionPair[] = PipelineStepValues.flatMap((from) =>
    PipelineStepValues.map((to) => ({
        from,
        to,
        legal: isLegalTransition(from, to),
        selfLoop: from === to,
    }))
)

/** The subset of `ALL_PAIRS` that the legacy table permits (21 edges). */
export const LEGAL_PAIRS: TransitionPair[] = ALL_PAIRS.filter((p) => p.legal)

/** The subset of `ALL_PAIRS` the legacy table rejects (148 pairs). */
export const ILLEGAL_PAIRS: TransitionPair[] = ALL_PAIRS.filter((p) => !p.legal)

/** `${from}->${to}` edge key for set-equality comparisons. */
export function edgeKey(from: string, to: string): string {
    return `${from}->${to}`
}

/** Edge-key set of the legal transitions — the golden graph baseline. */
export const LEGAL_EDGE_SET: Set<string> = new Set(
    LEGAL_PAIRS.map((p) => edgeKey(p.from, p.to))
)

/**
 * Parity machine context factory. Surface-only in P1a — the machine reads
 * nothing from it — but provided because `resolveState` requires a context
 * when the machine context type differs from XState's default.
 */
export function parityContext(
    overrides: Partial<PipelineContext> = {}
): PipelineContext {
    return { ...overrides }
}

/** Tripwire: the cartesian product MUST be 13x13. */
export const EXPECTED_PAIR_COUNT = 169
/** Tripwire: the legacy table MUST have exactly 21 legal edges. */
export const EXPECTED_LEGAL_COUNT = 21

/** Bogus (non-PipelineStep) values for the unknown-step fixtures. */
export const BOGUS_STEP = 'bogus-step'
