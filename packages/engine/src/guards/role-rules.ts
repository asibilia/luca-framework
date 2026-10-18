/**
 * Pure: the guard's decision for one tool call (`checkToolCall`). The rules
 * it checks live in the modules it re-exports.
 */
import { z } from 'zod'

import {
    ALLOW,
    deny,
    isWriter,
    READ_TOOLS,
    TOOLS,
    type GuardArgs,
    type ToolDecision,
} from './guard-roles'
import { checkBash } from './shell-rules'
import { insideWorktree, mayWrite } from './write-rules'

import type { EngineConfig } from '../config/engine-config'

export {
    GuardRoleSchema,
    guardRoleOf,
    isWriter,
    type GuardRole,
    type ToolDecision,
} from './guard-roles'
export {
    BASE_DISALLOWED_TOOLS,
    INSTALL_DENY_RULES,
    permissionRules,
} from './permission-rules'
export { checkCommands, READ_ONLY_COMMANDS } from './shell-rules'
export { isInstallPath, LOCKFILES, mayWrite } from './write-rules'

const FileInputSchema = z.object({ file_path: z.string().min(1) })

const SearchInputSchema = z.object({ path: z.string().min(1).optional() })

const BashInputSchema = z.object({
    command: z.string(),
    run_in_background: z.boolean().optional(),
    dangerouslyDisableSandbox: z.boolean().optional(),
})

const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit']

/** Tools every agent may call: the SDK's structured result, and the engine's own. */
const isEngineTool = (tool_name: string): boolean =>
    tool_name === 'StructuredOutput' || tool_name.startsWith('mcp__luca__')

/** The engine's message tool: only test-writers and implementers send. */
const SEND_MESSAGE_TOOL = 'mcp__luca__send_message'

/**
 * The guard's decision for one tool call, made before it runs (the SDK's
 * PreToolUse hook). Reviewers and the learner may not send agent messages.
 * It fails closed: an unknown tool, an input of the wrong
 * shape, a path outside the worktree, or a shell command off the role's list
 * is denied with a reason the agent can act on.
 *
 * @example
 * checkToolCall({ role: 'reviewer', may_edit_tests: false, tool_name: 'Bash', tool_input: { command: 'git commit' }, worktree, config })
 * // { allow: false, reason: '"git commit" is not allowed. ...' }
 */
export const checkToolCall = ({
    role,
    may_edit_tests,
    tool_name,
    tool_input,
    worktree,
    config,
}: GuardArgs & {
    tool_name: string
    tool_input: unknown
    /** The agent's worktree, as an absolute path. */
    worktree: string
    config: EngineConfig
}): ToolDecision => {
    if (tool_name === SEND_MESSAGE_TOOL && !isWriter(role)) {
        return deny(`A ${role} may not send agent messages.`)
    }
    if (isEngineTool(tool_name)) return ALLOW
    if (!TOOLS[role].includes(tool_name) && !WRITE_TOOLS.includes(tool_name)) {
        return deny(`A ${role} may not use ${tool_name}.`)
    }
    if (WRITE_TOOLS.includes(tool_name)) {
        const input = FileInputSchema.safeParse(tool_input)
        if (!input.success) return deny(`${tool_name} needs a file_path.`)
        const inner = insideWorktree({ worktree, path: input.data.file_path })
        if (inner === null) {
            return deny(`${input.data.file_path} is outside your worktree.`)
        }
        return mayWrite({ role, may_edit_tests, path: inner, config })
            ? ALLOW
            : deny(`A ${role} may not write ${inner}.`)
    }
    if (READ_TOOLS.includes(tool_name)) {
        const input =
            tool_name === 'Read'
                ? FileInputSchema.safeParse(tool_input)
                : SearchInputSchema.safeParse(tool_input)
        if (!input.success)
            return deny(`${tool_name} got an input of the wrong shape.`)
        const path =
            'file_path' in input.data ? input.data.file_path : input.data.path
        if (path !== undefined && insideWorktree({ worktree, path }) === null) {
            return deny(`${path} is outside your worktree.`)
        }
        return ALLOW
    }
    if (tool_name === 'Bash') {
        const input = BashInputSchema.safeParse(tool_input)
        if (!input.success) return deny('Bash needs a command.')
        if (input.data.run_in_background === true) {
            return deny('No background commands.')
        }
        if (input.data.dangerouslyDisableSandbox === true) {
            return deny('Every command runs in the sandbox.')
        }
        return checkBash({
            role,
            may_edit_tests,
            command: input.data.command,
            worktree,
            config,
        })
    }
    return deny(`A ${role} may not use ${tool_name}.`)
}
