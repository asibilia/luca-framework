import type {
    HookCallback,
    HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk'

import { checkToolCall, type GuardRole } from './role-rules'

import type { EngineConfig } from '../config/engine-config'

/**
 * The guard as an SDK `PreToolUse` hook: every tool call goes through
 * `checkToolCall` before it runs. A denial goes back to the agent with its
 * reason. An allowed call gets no opinion from the hook, so the SDK's own
 * permission rules still apply. Any error in the guard itself denies.
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
}: {
    role: GuardRole
    /** Whether the agent may edit test files. */
    may_edit_tests: boolean
    /** The agent's worktree, as an absolute path. */
    worktree: string
    config: EngineConfig
    /** Called for each denied call, such as to count it. */
    on_deny?: (denial: { tool_name: string; reason: string }) => void
}): HookCallback => {
    const denied = (reason: string): HookJSONOutput => ({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
        },
    })
    return async (input): Promise<HookJSONOutput> => {
        if (input.hook_event_name !== 'PreToolUse') return {}
        try {
            const decision = checkToolCall({
                role,
                may_edit_tests,
                tool_name: input.tool_name,
                tool_input: input.tool_input,
                worktree,
                config,
            })
            if (decision.allow) return {}
            on_deny?.({ tool_name: input.tool_name, reason: decision.reason })
            return denied(decision.reason)
        } catch (error) {
            return denied(
                `The guard could not check this call: ${String(error)}`
            )
        }
    }
}
