import type {
    HookCallback,
    HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk'

import { checkHelperTool, HELPER_TOOL, MAX_HELPERS } from './helper-rules'
import { checkToolCall, type GuardRole } from './role-rules'

import type { EngineConfig } from '../config/engine-config'

/**
 * The guard as an SDK `PreToolUse` hook: every tool call goes through
 * `checkToolCall` before it runs. A denial goes back to the agent with its
 * reason. An allowed call gets no opinion from the hook, so the SDK's own
 * permission rules still apply. Any error in the guard itself denies.
 *
 * Helpers (#627): a call from inside a helper (one with the SDK's
 * `agent_id`) may only read and search, whatever the agent may do. An
 * allowed helper goes into `helpers`, by the id of the call that started it,
 * until its result comes back (the launcher takes it out); a helper past
 * `MAX_HELPERS` running is denied. `on_helper` is called for each one
 * started.
 *
 * @example
 * const hook = createGuardHook({ role: 'implementer', may_edit_tests: false, worktree, config, on_deny: (denial) => denials.push(denial) })
 * const options = { hooks: { PreToolUse: [{ hooks: [hook] }] } }
 */
export const createGuardHook = ({
    role,
    may_edit_tests,
    worktree,
    config,
    on_deny,
    helpers = new Set(),
    on_helper,
}: {
    role: GuardRole
    /** Whether the agent may edit test files. */
    may_edit_tests: boolean
    /** The agent's worktree, as an absolute path. */
    worktree: string
    config: EngineConfig
    /** Called for each denied call, such as to count it. */
    on_deny?: (denial: { tool_name: string; reason: string }) => void
    /** The agent's running helpers, by the tool call that started each. */
    helpers?: Set<string>
    /** Called for each helper started, such as to count it. */
    on_helper?: () => void
}): HookCallback => {
    const denied = (reason: string): HookJSONOutput => ({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
        },
    })
    return async (input, tool_use_id): Promise<HookJSONOutput> => {
        if (input.hook_event_name !== 'PreToolUse') return {}
        try {
            const fromHelper = input.agent_id !== undefined
            const helperTool = fromHelper
                ? checkHelperTool({ tool_name: input.tool_name })
                : null
            const decision =
                helperTool !== null && !helperTool.allow
                    ? helperTool
                    : checkToolCall({
                          role,
                          may_edit_tests,
                          tool_name: input.tool_name,
                          tool_input: input.tool_input,
                          worktree,
                          config,
                      })
            const full =
                decision.allow &&
                input.tool_name === HELPER_TOOL &&
                helpers.size >= MAX_HELPERS
            if (decision.allow && !full) {
                if (input.tool_name === HELPER_TOOL) {
                    helpers.add(tool_use_id ?? input.tool_use_id)
                    on_helper?.()
                }
                return {}
            }
            const reason = decision.allow
                ? `At most ${MAX_HELPERS} helpers run at once: wait for one to finish.`
                : decision.reason
            on_deny?.({ tool_name: input.tool_name, reason })
            return denied(reason)
        } catch (error) {
            return denied(
                `The guard could not check this call: ${String(error)}`
            )
        }
    }
}
