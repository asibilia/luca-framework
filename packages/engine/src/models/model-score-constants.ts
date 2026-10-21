import type { FindingSeverity } from '../agents/role-results'
import type { Effort } from '../config/engine-config'

/**
 * The model score report's constants (#605), in one place: how findings
 * weigh, the verdict edges, and the roles it scores.
 */

/** How much each ticket review finding weighs. */
export const FINDING_WEIGHTS: Record<FindingSeverity, number> = {
    blocker: 3,
    should_fix: 1,
    nit: 0,
}

/** The fewest tickets on each side before a verdict is given. */
export const MIN_TICKETS = 10

/** How far above the baseline a rate may be before it is "worse". */
export const WORSE_BY = 0.2

/** Rounding slack when a rate is compared with the baseline's. */
export const EPSILON = 1e-9

/** The effort every role ran at before #659; a `null` effort reads as it. */
export const EFFORT_BEFORE_JOURNALED: Effort = 'high'

/** The roles scored by the ticket review's findings. */
export const SCORED_ROLES = ['test-writer', 'implementer'] as const

export type ScoredRole = (typeof SCORED_ROLES)[number]
