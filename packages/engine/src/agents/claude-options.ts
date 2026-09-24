import type {
    EffortLevel,
    HookCallback,
    McpSdkServerConfigWithInstance,
    Options,
} from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import { roleInstructions } from './role-instructions'
import {
    ImplementerResultSchema,
    LensReviewResultSchema,
    TestWriterResultSchema,
    TicketReviewResultSchema,
    type AgentRole,
} from './role-results'

import type { EngineConfig } from '../config/engine-config'
import { guardRoleOf, permissionRules } from '../guards/role-rules'
import { sandboxSettings } from '../guards/sandbox-settings'

/** Every role runs on Claude Opus 5.5. */
export const CLAUDE_MODEL = 'claude-opus-5-5'

/** Every role runs at the same effort level. */
export const AGENT_EFFORT: EffortLevel = 'high'

/** How many model turns one agent gets before its try ends. */
export const MAX_TURNS: Record<AgentRole, number> = {
    'test-writer': 80,
    implementer: 120,
    'ticket-reviewer': 60,
    'architecture-lens': 60,
    'simplification-lens': 60,
    'security-lens': 60,
    'integration-lens': 60,
    'rules-lens': 60,
}

/**
 * Why a model id may not run an agent, or `null` if it may. Only Claude
 * models run, and never a Fable model.
 *
 * @example
 * checkModel({ model: 'claude-opus-5-5' }) // null
 * checkModel({ model: 'claude-fable-5' }) // 'Fable models are refused: claude-fable-5'
 */
export const checkModel = ({ model }: { model: string }): string | null => {
    if (/fable/i.test(model)) return `Fable models are refused: ${model}`
    if (!/^claude-/.test(model))
        return `Only Claude models run agents: ${model}`
    return null
}

/** The only variables an agent's process inherits from the engine's. */
const ENV_ALLOW_LIST = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TERM',
]

/** Variables that would bill an API key or reroute the model, never passed on. */
export const BANNED_ENV = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
]

/**
 * A clean environment for an agent's process, built from an allow-list, so
 * no API key, token, or other secret of the engine's reaches it. Auto memory
 * and claude.ai MCP servers are off.
 *
 * @example
 * const env = agentEnv({ source: process.env })
 */
export const agentEnv = ({
    source,
}: {
    source: Record<string, string | undefined>
}): Record<string, string> => {
    const env: Record<string, string> = {}
    for (const name of ENV_ALLOW_LIST) {
        const value = source[name]
        if (value !== undefined && !BANNED_ENV.includes(name)) {
            env[name] = value
        }
    }
    return {
        ...env,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
        ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
        CLAUDE_AGENT_SDK_CLIENT_APP: 'luca-engine/0.0.0',
    }
}

const RESULT_SCHEMAS: Record<AgentRole, z.ZodType> = {
    'test-writer': TestWriterResultSchema,
    implementer: ImplementerResultSchema,
    'ticket-reviewer': TicketReviewResultSchema,
    'architecture-lens': LensReviewResultSchema,
    'simplification-lens': LensReviewResultSchema,
    'security-lens': LensReviewResultSchema,
    'integration-lens': LensReviewResultSchema,
    'rules-lens': LensReviewResultSchema,
}

/** A role's result schema as JSON Schema, for the SDK's structured output. */
export const resultJsonSchema = ({
    role,
}: {
    role: AgentRole
}): Record<string, unknown> => {
    const { $schema: _, ...schema } = z.toJSONSchema(RESULT_SCHEMAS[role], {
        target: 'draft-7',
    })
    return schema
}

/**
 * The SDK options for one agent: Opus 5.5 at one effort for every role, the
 * role's instructions, its result schema, `dontAsk` with only its own
 * pre-approved calls, the guard hook, the sandbox, a clean environment, and
 * nothing loaded from the machine: no settings, MCP servers, or skills.
 * An agent with messaging also gets the engine's own `luca` server and the
 * delivery hook after every tool call, failed ones too; a reviewer gets
 * neither. Pure: the caller resolves every path and builds the server and
 * hooks.
 *
 * @example
 * const options = agentOptions({ role, may_edit_tests, cwd, model: CLAUDE_MODEL, effort: AGENT_EFFORT, claude_path, config, common_git_dir, home, env, guard_hook, luca_server: null, delivery_hook: null })
 */
export const agentOptions = ({
    role,
    may_edit_tests,
    cwd,
    model,
    effort,
    claude_path,
    config,
    common_git_dir,
    home,
    env,
    guard_hook,
    luca_server,
    delivery_hook,
    stderr,
}: {
    role: AgentRole
    /** Whether the agent may edit test files; the guards enforce it. */
    may_edit_tests: boolean
    /** The agent's worktree, real and absolute. */
    cwd: string
    model: string
    effort: EffortLevel
    /** The real path of the installed `claude` binary. */
    claude_path: string
    config: EngineConfig
    common_git_dir: string
    home: string
    env: Record<string, string>
    guard_hook: HookCallback
    /** The engine's `luca` server (`createLucaServer`), or `null` for none. */
    luca_server: McpSdkServerConfigWithInstance | null
    /** Hands over agent messages after each tool call, or `null` for none. */
    delivery_hook: HookCallback | null
    stderr?: (data: string) => void
}): Options => {
    const guard = guardRoleOf({ role })
    const rules = permissionRules({ role: guard, may_edit_tests, config })
    return {
        cwd,
        model,
        effort,
        pathToClaudeCodeExecutable: claude_path,
        systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            // Only an agent with messaging is told about it (the final
            // review's fixers are test-writers and implementers with none).
            append: roleInstructions({
                role,
                may_edit_tests,
                config,
                messaging: luca_server !== null,
            }),
        },
        outputFormat: {
            type: 'json_schema',
            schema: resultJsonSchema({ role }),
        },
        permissionMode: 'dontAsk',
        permissionPrompts: 'none',
        tools: rules.tools,
        allowedTools: rules.allowed,
        disallowedTools: rules.disallowed,
        settingSources: [],
        strictMcpConfig: true,
        // Only the engine's own in-process server, and only for an agent
        // with messaging: `send_message`.
        mcpServers: luca_server === null ? {} : { luca: luca_server },
        skills: [],
        sandbox: sandboxSettings({
            role: guard,
            may_edit_tests,
            worktree: cwd,
            common_git_dir,
            home,
            config,
        }),
        env,
        persistSession: false,
        maxTurns: MAX_TURNS[role],
        hooks: {
            PreToolUse: [{ hooks: [guard_hook] }],
            ...(delivery_hook === null
                ? {}
                : {
                      PostToolUse: [{ hooks: [delivery_hook] }],
                      PostToolUseFailure: [{ hooks: [delivery_hook] }],
                  }),
        },
        ...(stderr === undefined ? {} : { stderr }),
    }
}
