/**
 * Pure: the effort each role runs at (#659), whichever model it runs on.
 * The launcher takes it per launch, as it takes the model; a follow-up runs
 * at its session's effort. Helpers run at `HELPER_EFFORT`, set in their own
 * definition.
 */
import type { AgentRole } from './role-results'

import type { Effort } from '../config/engine-config'

/** The effort a writer and the learner run at. */
export const DEFAULT_EFFORT: Effort = 'medium'

/**
 * The effort reviewers always run at, the ticket reviewer and the five
 * lenses, and the final review's fixers: the last code written before the
 * pull request.
 */
export const REVIEW_EFFORT: Effort = 'xhigh'

/** The effort every agent ran at before #659, for older journals. */
export const PAST_EFFORT: Effort = 'high'

/**
 * The effort each role launches at. Every agent of the final review, lens or
 * fixer, runs at `REVIEW_EFFORT` instead.
 */
export const ROLE_EFFORT: Record<AgentRole, Effort> = {
    'test-writer': DEFAULT_EFFORT,
    implementer: DEFAULT_EFFORT,
    'ticket-reviewer': REVIEW_EFFORT,
    'architecture-lens': REVIEW_EFFORT,
    'simplification-lens': REVIEW_EFFORT,
    'security-lens': REVIEW_EFFORT,
    'integration-lens': REVIEW_EFFORT,
    'rules-lens': REVIEW_EFFORT,
    learner: DEFAULT_EFFORT,
}
