import type { FindingSeverity } from '../agents/role-results'
import type { EffortLevel } from '../config/engine-config'

/**
 * The model score report's constants (#605, #662): the finding weights, the
 * verdict edges, the scored roles, and the effort an older journal's agent
 * ran at. The one place they live.
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

/** The roles scored by the ticket review's findings. */
export const SCORED_ROLES = ['test-writer', 'implementer'] as const

export type ScoredRole = (typeof SCORED_ROLES)[number]

/**
 * The effort an agent with no journaled effort ran at: every role ran at
 * `high` before #659.
 */
export const EFFORT_BEFORE_659: EffortLevel = 'high'
