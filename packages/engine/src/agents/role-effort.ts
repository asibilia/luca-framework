/**
 * Pure: the effort each role runs at (#659), whatever model it runs on.
 * Writers on tickets and the learner run at the config's `models.effort`,
 * medium by default (#660); the reviewers, and the last writers before the
 * pull request, at xhigh. Helpers run at their own definition's effort
 * (`HELPER_EFFORT`).
 */
import type { AgentRole } from './role-results'

import {
    modelsOf,
    ModelsConfigSchema,
    type EffortLevel,
    type EngineConfig,
} from '../config/engine-config'

/** The effort the reviewers, and the final review's fixers, always run at. */
export const REVIEW_EFFORT: EffortLevel = 'xhigh'

/**
 * Each role's effort on ticket work (and the learner's), with no
 * `models.effort` set: the writers' and the learner's are the schema's
 * defaults.
 */
export const ROLE_EFFORT: Record<AgentRole, EffortLevel> = {
    ...ModelsConfigSchema.parse({}).effort,
    'ticket-reviewer': REVIEW_EFFORT,
    'architecture-lens': REVIEW_EFFORT,
    'simplification-lens': REVIEW_EFFORT,
    'security-lens': REVIEW_EFFORT,
    'integration-lens': REVIEW_EFFORT,
    'rules-lens': REVIEW_EFFORT,
}

/**
 * The effort a fresh agent launches at: its role's, as the run's config
 * sets it, or `REVIEW_EFFORT` for a final review's fixer. A follow-up runs
 * at its session's instead.
 *
 * @example
 * roleEffort({ role: 'implementer', config }) // 'medium'
 * roleEffort({ role: 'implementer', config, final_fix: true }) // 'xhigh'
 */
export const roleEffort = ({
    role,
    config,
    final_fix = false,
}: {
    role: AgentRole
    config: EngineConfig
    final_fix?: boolean
}): EffortLevel =>
    final_fix
        ? REVIEW_EFFORT
        : { ...ROLE_EFFORT, ...modelsOf({ config }).effort }[role]
