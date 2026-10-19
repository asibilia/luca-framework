/**
 * The guard's roles: which role each agent plays by, the tools each sees, and
 * the shape of a guard decision.
 */
import { z } from 'zod'

import type { AgentRole } from '../agents/role-results'

/**
 * The roles the **guard** knows. `reviewer` covers every reviewer (the ticket
 * reviewer and the final review's lenses). The learner has no agent
 * role yet (#370) but its rules are here already.
 */
export const GuardRoleSchema = z.enum([
    'test-writer',
    'implementer',
    'reviewer',
    'learner',
])

export type GuardRole = z.infer<typeof GuardRoleSchema>

const GUARD_ROLE_OF: Record<AgentRole, GuardRole> = {
    'test-writer': 'test-writer',
    implementer: 'implementer',
    'ticket-reviewer': 'reviewer',
    'architecture-lens': 'reviewer',
    'simplification-lens': 'reviewer',
    'security-lens': 'reviewer',
    'integration-lens': 'reviewer',
    'rules-lens': 'reviewer',
    learner: 'learner',
}

/** The guard role an agent role plays by. */
export const guardRoleOf = ({ role }: { role: AgentRole }): GuardRole =>
    GUARD_ROLE_OF[role]

/** Whether a guard role may change files at all. */
export const isWriter = (role: GuardRole): boolean =>
    role === 'test-writer' || role === 'implementer'

/** What the guard says about one tool call. */
export type ToolDecision = { allow: true } | { allow: false; reason: string }

export const ALLOW: ToolDecision = { allow: true }

export const deny = (reason: string): ToolDecision => ({ allow: false, reason })

/** The rules an agent's guards check it against: its role, and whether it may edit tests. */
export type GuardArgs = {
    role: GuardRole
    /**
     * Whether this agent may edit test files: true for the test-writer and a
     * refactor ticket's implementer. A test-writer without it writes nothing;
     * a reviewer or the learner never writes, whatever it says.
     */
    may_edit_tests: boolean
}

export const READ_TOOLS = ['Read', 'Grep', 'Glob']

export const TOOLS: Record<GuardRole, string[]> = {
    'test-writer': ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
    implementer: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
    reviewer: ['Read', 'Grep', 'Glob', 'Bash'],
    learner: ['Read', 'Grep', 'Glob'],
}
