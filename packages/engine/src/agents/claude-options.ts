import type {
    HookCallback,
    McpSdkServerConfigWithInstance,
    Options,
} from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import { roleInstructions } from './role-instructions'
import {
    ImplementerResultSchema,
    IntegrationLensResultSchema,
    LearnerResultSchema,
    LensReviewResultSchema,
    TestWriterResultSchema,
    TicketReviewResultSchema,
    type AgentRole,
} from './role-results'

import {
    DEFAULT_MODEL,
    ModelNameSchema,
    type Effort,
    type EngineConfig,
} from '../config/engine-config'
import { lucaVersion } from '../config/luca-version'
import { HELPER_TYPE, SEARCHER } from '../guards/helper-rules'
import { guardRoleOf, permissionRules } from '../guards/role-rules'
import { sandboxSettings } from '../guards/sandbox-settings'

/** The models an agent may launch on, by short name (`ModelNameSchema`). */
export const MODEL_NAMES = ModelNameSchema.options

/** The model reviewers run on, and every agent the decision model doesn't route (#603). */
export const CLAUDE_MODEL = DEFAULT_MODEL

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
    learner: 40,
}

/**
 * Why a model may not launch an agent, or `null` if it may: exactly one of
 * `MODEL_NAMES`. Every other short name is refused, since some (such as
 * `best` or `opusplan`) resolve to Fable or switch models mid-session.
 *
 * @example
 * checkLaunchModel({ model: 'sonnet' }) // null
 * checkLaunchModel({ model: 'fable' }) // 'Fable models are refused: fable'
 */
export const checkLaunchModel = ({
    model,
}: {
    model: string
}): string | null => {
    if (/fable/i.test(model)) return `Fable models are refused: ${model}`
    if (!ModelNameSchema.safeParse(model).success)
        return `Agents launch only on ${MODEL_NAMES.join(', ')}: ${model}`
    return null
}

/**
 * Why the model a session's init names may not run an agent, or `null` if it
 * may. Only Claude model ids run, and never a Fable model.
 *
 * @example
 * checkModel({ model: 'gpt-5' }) // 'Only Claude models run agents: gpt-5'
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
 * and claude.ai MCP servers are off. The Agent SDK client tag names the
 * engine at Luca's version (the engine's own, unless given).
 *
 * @example
 * const env = agentEnv({ source: process.env })
 */
export const agentEnv = ({
    source,
    luca_version = lucaVersion(),
}: {
    source: Record<string, string | undefined>
    luca_version?: string
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
        CLAUDE_AGENT_SDK_CLIENT_APP: `luca-engine/${luca_version}`,
    }
}

const RESULT_SCHEMAS: Record<AgentRole, z.ZodType> = {
    'test-writer': TestWriterResultSchema,
    implementer: ImplementerResultSchema,
    'ticket-reviewer': TicketReviewResultSchema,
    'architecture-lens': LensReviewResultSchema,
    'simplification-lens': LensReviewResultSchema,
    'security-lens': LensReviewResultSchema,
    'integration-lens': IntegrationLensResultSchema,
    'rules-lens': LensReviewResultSchema,
    learner: LearnerResultSchema,
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
 * The SDK options for one agent: its model at its launch's effort, the
 * role's instructions, its result schema, `dontAsk` with only its own
 * pre-approved calls, the guard hook, the sandbox, a clean environment, and
 * nothing loaded from the machine: no settings, MCP servers, or skills.
 * Every agent may start the read-only `searcher` helper (#627).
 * An agent with messaging also gets the engine's own `luca` server and the
 * delivery hook after every tool call, failed ones too; a reviewer gets
 * neither. Pure: the caller resolves every path and builds the server and
 * hooks.
 *
 * @example
 * const options = agentOptions({ role, may_edit_tests, cwd, model: CLAUDE_MODEL, effort: 'medium', claude_path, config, common_git_dir, home, env, guard_hook, luca_server: null, delivery_hook: null })
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
    effort: Effort
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
        // The one helper every role may start (#627), always on Haiku, at
        // low effort.
        agents: { [HELPER_TYPE]: SEARCHER },
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
        // Streamed chunks only feed the live file's heartbeat (#631); the
        // launcher keeps nothing of them.
        includePartialMessages: true,
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
