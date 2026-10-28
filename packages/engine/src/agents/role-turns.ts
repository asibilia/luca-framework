/**
 * Pure: how many model turns each role gets, whatever launcher runs it. A
 * launch's own `max_turns` (#684) replaces its role's.
 */
import type { AgentRole } from './role-results'

/**
 * How many model turns one agent gets before its try ends. The integration
 * lens reads how every ticket fits together on the whole branch, and the
 * rules lens reads every rule file against it (#684), so they get more than
 * the other lenses.
 */
export const MAX_TURNS: Record<AgentRole, number> = {
    'test-writer': 80,
    implementer: 150,
    'ticket-reviewer': 60,
    'architecture-lens': 60,
    'simplification-lens': 60,
    'security-lens': 60,
    'integration-lens': 100,
    'rules-lens': 100,
    learner: 40,
}
