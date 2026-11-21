/**
 * Per-session temp directory, hook config, strict child env, turn reset,
 * and CLI argv builders for `createAgyLauncher` (#782).
 */
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk'

import { AGY_TURNS_FILE } from './agy-hook'
import { parseDenialsJsonl, type AgyDenial } from './agy-stream'
import type { AgyHookState } from './agy-tool-rules'
import { BANNED_ENV, ENV_ALLOW_LIST, resultJsonSchema } from './claude-options'
import type { AgentRole } from './role-results'

import { shellWord } from '../shell/run-command'

/** API keys and proxy variables never passed to `agy` child processes. */
export const AGY_BANNED_ENV: readonly string[] = [
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    ...BANNED_ENV,
]

/** Paths created inside one isolated `agy` session temp directory. */
export type AgySessionFiles = {
    temp_dir: string
    hooks_dir: string
    schema_path: string
    state_path: string
    denials_path: string
    out_of_turns_path: string
    /** `PreInvocation`'s turn count for the running process (`AGY_TURNS_FILE`). */
    turns_path: string
}

/**
 * Builds the allowlisted child environment for `agy`, stripping API/proxy keys
 * so `agy` uses the signed-in Antigravity subscription, and sets
 * `LUCA_AGY_STATE_DIR`.
 */
export const agyEnv = ({
    source,
    state_dir,
}: {
    source: Record<string, string | undefined>
    state_dir: string
}): Record<string, string> => {
    const env: Record<string, string> = {}
    for (const name of ENV_ALLOW_LIST) {
        const value = source[name]
        if (value !== undefined && !AGY_BANNED_ENV.includes(name)) {
            env[name] = value
        }
    }
    return {
        ...env,
        LUCA_AGY_STATE_DIR: state_dir,
    }
}

const AGY_EFFORT_SUFFIX_RE = /-(low|medium|high|xhigh)$/
const AGY_XHIGH_FAMILIES = new Set(['gemini-4-neon', 'gemini-4-hydrogen'])

/**
 * Resolves a `(model, effort)` pair to `agy`'s effort-suffixed CLI model ID.
 * `gemini-4-neon` and `gemini-4-hydrogen` support up to `xhigh`; all other
 * Gemini families clamp `xhigh`/`max` to `high`.
 */
export const resolveAgyCliModel = ({
    model,
    effort,
}: {
    model: string
    effort: EffortLevel
}): string => {
    const base = model.replace(AGY_EFFORT_SUFFIX_RE, '')
    const clamped = AGY_XHIGH_FAMILIES.has(base)
        ? effort === 'max'
            ? 'xhigh'
            : effort
        : effort === 'xhigh' || effort === 'max'
          ? 'high'
          : effort
    return `${base}-${clamped}`
}

/**
 * Builds `.agents/hooks.json` loaded via `--add-dir` for one `agy` session.
 * `agy` runs each hook `command` through a shell, so both paths are
 * single-quoted (`shellWord`): a space or quote in either must not break
 * every guard hook.
 *
 * @example
 * buildAgyHooksJson({ bun_path: '/opt/my bun/bun', hook_script_path: '/x/agy-hook.ts' })
 * // luca.SessionStart[0].command === "'/opt/my bun/bun' '/x/agy-hook.ts'"
 */
export const buildAgyHooksJson = ({
    bun_path,
    hook_script_path,
}: {
    bun_path: string
    hook_script_path: string
}): Record<string, unknown> => {
    const command = `${shellWord(bun_path)} ${shellWord(hook_script_path)}`
    return {
        luca: {
            SessionStart: [{ type: 'command', command }],
            PreToolUse: [
                {
                    matcher: '*',
                    hooks: [{ type: 'command', command }],
                },
            ],
            PreInvocation: [{ type: 'command', command }],
        },
    }
}

/**
 * Creates a fresh per-session temp directory under `temp_root` with
 * `schema.json` and `hooks/.agents/hooks.json`.
 */
export const createAgySessionFiles = ({
    temp_root,
    role,
    bun_path,
    hook_script_path,
}: {
    temp_root: string
    role: AgentRole
    bun_path: string
    hook_script_path: string
}): AgySessionFiles => {
    mkdirSync(temp_root, { recursive: true })
    const temp_dir = realpathSync(mkdtempSync(join(temp_root, 'luca-agy-')))
    const hooks_dir = join(temp_dir, 'hooks')
    const hooks_agents_dir = join(hooks_dir, '.agents')
    mkdirSync(hooks_agents_dir, { recursive: true })

    const schema_path = join(temp_dir, 'schema.json')
    writeFileSync(
        schema_path,
        JSON.stringify(resultJsonSchema({ role }), null, 2)
    )
    writeFileSync(
        join(hooks_agents_dir, 'hooks.json'),
        JSON.stringify(
            buildAgyHooksJson({ bun_path, hook_script_path }),
            null,
            2
        )
    )

    return {
        temp_dir,
        hooks_dir,
        schema_path,
        state_path: join(temp_dir, 'state.json'),
        denials_path: join(temp_dir, 'denials.jsonl'),
        out_of_turns_path: join(temp_dir, 'out-of-turns.flag'),
        turns_path: join(temp_dir, AGY_TURNS_FILE),
    }
}

/** Writes `state.json` inside the session's temp directory. */
export const writeAgyHookState = ({
    state_path,
    state,
}: {
    state_path: string
    state: AgyHookState
}): void => {
    writeFileSync(state_path, JSON.stringify(state))
}

/**
 * Resets per-turn `denials.jsonl`, `out-of-turns.flag` and the hook's turn
 * count (`turns_path`) before spawning, so each `agy` process
 * gets its own `max_turns`.
 */
export const resetAgyTurnFiles = ({
    files,
}: {
    files: Pick<
        AgySessionFiles,
        'denials_path' | 'out_of_turns_path' | 'turns_path'
    >
}): void => {
    writeFileSync(files.denials_path, '')
    rmSync(files.out_of_turns_path, { force: true })
    rmSync(files.turns_path, { force: true })
}

/** Reads recorded guard denials from `denials.jsonl` at turn end. */
export const readAgyDenials = ({
    denials_path,
}: {
    denials_path: string
}): AgyDenial[] => {
    if (!existsSync(denials_path)) return []
    try {
        return parseDenialsJsonl({ text: readFileSync(denials_path, 'utf8') })
    } catch {
        return []
    }
}

/** Whether `PreInvocation` wrote `out-of-turns.flag` for this turn. */
export const isAgyOutOfTurns = ({
    out_of_turns_path,
}: {
    out_of_turns_path: string
}): boolean => existsSync(out_of_turns_path)

/** Recursively removes a session's temporary directory. */
export const removeAgySessionDir = ({
    temp_dir,
}: {
    temp_dir: string
}): void => {
    rmSync(temp_dir, { recursive: true, force: true })
}

/** Builds the `agy` CLI argv for `launch` or `followUp`. */
export const buildAgyArgv = ({
    prompt,
    session_id,
    model,
    effort,
    schema_path,
    hooks_dir,
    turn_timeout_ms,
}: {
    prompt: string
    session_id?: string
    model: string
    effort: EffortLevel
    schema_path: string
    hooks_dir: string
    turn_timeout_ms: number
}): string[] => [
    '-p',
    prompt,
    ...(session_id === undefined ? [] : ['--conversation', session_id]),
    '--model',
    resolveAgyCliModel({ model, effort }),
    '--output-format',
    'stream-json',
    '--json-schema',
    schema_path,
    '--add-dir',
    hooks_dir,
    '--sandbox',
    '--disable-slash-commands',
    '--print-timeout',
    `${Math.ceil(turn_timeout_ms / 1000)}s`,
]
