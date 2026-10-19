/**
 * Each role's instructions, put together from the role's task section and
 * the shared sections.
 */
import { COMMON, HELPERS, MESSAGES, shellRules } from './common-instructions'
import { LEARNER, LEARNER_RULES } from './learner-instructions'
import { LENS, REVIEWER } from './reviewer-instructions'
import { lensOf, type AgentRole } from './role-results'
import { IMPLEMENTER, TEST_WRITER } from './writer-instructions'

import type { EngineConfig } from '../config/engine-config'
import { canMessage } from '../messages/agent-messages'

/**
 * The instructions a role's agent gets, appended to Claude Code's own system
 * prompt. No stock skills: every role gets only these. They name the exact
 * commands the role may run, forbid git, GitHub, and the network, and say
 * what the structured result holds. A refactor ticket's implementer (who
 * may edit tests) is told it may follow renames into test files. Test-writers
 * and implementers with messaging are told how agent messages work;
 * reviewers aren't. Each final review lens gets its own focus; the
 * integration lens also gives the PR's Summary picture and Merge Danger
 * (#513). The learner (#370) gets its own task and rules: no shell,
 * nothing written. Every role is told about its read-only helpers (#627).
 *
 * @example
 * const append = roleInstructions({ role: 'implementer', may_edit_tests: false, config })
 */
export const roleInstructions = ({
    role,
    may_edit_tests,
    config,
    messaging,
}: {
    role: AgentRole
    may_edit_tests: boolean
    config: EngineConfig
    /**
     * Whether the agent has agent messages. Defaults to its role's
     * (`canMessage`); the final review's fixers have none.
     */
    messaging?: boolean
}): string => {
    // The learner has no shell and no agent messages, and its rules differ.
    if (role === 'learner')
        return [LEARNER, HELPERS, LEARNER_RULES].join('\n\n')
    const lens = lensOf({ role })
    const task =
        lens !== null
            ? LENS({ lens })
            : role === 'test-writer'
              ? TEST_WRITER({ config })
              : role === 'implementer'
                ? IMPLEMENTER({ config, may_edit_tests })
                : REVIEWER
    return [
        task,
        shellRules({ role, config }),
        ...((messaging ?? canMessage({ role })) ? [MESSAGES] : []),
        HELPERS,
        COMMON,
    ].join('\n\n')
}
