import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { defaultAntigravityHome, defaultClaudeHome } from './install-skills.ts'

export interface WireClaudeHooksOptions {
    /** Global config directory. Defaults to `~/.claude` for Claude or `~/.gemini/antigravity-cli` for Antigravity. */
    home?: string
    /** Alias for home, kept for compatibility with older callers. */
    claudeHome?: string
    log?: (msg: string) => void
    /** MuninnDB API token. If provided, overrides reading from ~/.muninn/mcp.token */
    token?: string
}

// Matcher per decision:luca-stage-gate-hook-scope-2026-05-19 (D2): hook fires
// on every tool that can mutate the filesystem.
const CLAUDE_STAGE_GATE_MATCHER = 'Edit|Write|NotebookEdit|Bash'
const AGY_STAGE_GATE_MATCHER =
    'replace|write_file|run_shell_command|run_command'

/**
 * Command registered in the agent's global settings. The luca CLI is on PATH
 * (installed globally), so the hook needs no wrapper script — it delegates
 * straight to `luca hook stage-gate`, which reads the project's
 * `.luca/state.json` relative to the cwd at invocation time. In a non-luca
 * repo there is no state, so the handler defaults to IDLE and allows
 * everything.
 */
const STAGE_GATE_COMMAND = 'luca hook stage-gate'

interface HookEntry {
    type: 'command'
    command: string
    timeout?: number
    statusMessage?: string
}

interface PreToolUseEntry {
    matcher: string
    hooks: HookEntry[]
}

interface ClaudeSettings {
    hooks?: {
        PreToolUse?: PreToolUseEntry[]
        [k: string]: unknown
    }
    [k: string]: unknown
}

interface AntigravitySettings {
    hooks?: AntigravityHooks
    mcpServers?: Record<
        string,
        {
            command: string
            args: string[]
            env?: Record<string, string>
        }
    >
    [k: string]: unknown
}

interface AntigravityHooks {
    [hookName: string]: {
        enabled?: boolean
        PreToolUse?: PreToolUseEntry[]
        [k: string]: unknown
    }
}

/**
 * Register the luca stage-gate hook in the *global* Claude settings
 * (`~/.claude/settings.json`). Merges the PreToolUse entry into any
 * existing settings without clobbering unrelated config.
 *
 * The hook is installed globally so a single luca CLI version owns it
 * across every project; only `.luca/` planning files are written
 * per-repo. Idempotent — re-running won't duplicate the entry.
 */
export async function wireClaudeHooks(
    opts: WireClaudeHooksOptions = {}
): Promise<void> {
    const log = opts.log ?? (() => {})
    const claudeHome = opts.home ?? opts.claudeHome ?? defaultClaudeHome()
    const settingsPath = join(claudeHome, 'settings.json')

    await mkdir(claudeHome, { recursive: true })

    // Read existing settings.json (if any) and merge — never clobber the
    // user's global Claude config.
    const existing = existsSync(settingsPath)
        ? ((JSON.parse(
              await readFile(settingsPath, 'utf-8')
          ) as ClaudeSettings) ?? {})
        : {}

    const next = mergeStageGateRegistration(existing)

    await writeFile(settingsPath, JSON.stringify(next, null, 2) + '\n')
    log(`  write: ${settingsPath}`)
}

/**
 * Register the luca stage-gate hook in the *global* Antigravity hooks
 * (`~/.gemini/antigravity-cli/hooks.json`).
 */
export async function wireAntigravityHooks(
    opts: WireClaudeHooksOptions = {}
): Promise<void> {
    const log = opts.log ?? (() => {})
    const agyHome = opts.home ?? defaultAntigravityHome()
    const hooksPath = join(agyHome, 'hooks.json')

    await mkdir(agyHome, { recursive: true })

    const existing = existsSync(hooksPath)
        ? ((JSON.parse(
              await readFile(hooksPath, 'utf-8')
          ) as AntigravityHooks) ?? {})
        : {}

    const next = mergeAntigravityHookRegistration(existing)

    await writeFile(hooksPath, JSON.stringify(next, null, 2) + '\n')
    log(`  write: ${hooksPath}`)
}

/**
 * Register the MuninnDB MCP server in the *global* Antigravity settings
 * (`~/.gemini/antigravity-cli/mcp_config.json`).
 */
export async function wireAntigravityMcp(
    opts: WireClaudeHooksOptions = {}
): Promise<void> {
    const log = opts.log ?? (() => {})
    const agyHome = opts.home ?? defaultAntigravityHome()
    const mcpConfigPath = join(agyHome, 'mcp_config.json')

    await mkdir(agyHome, { recursive: true })

    const existing = existsSync(mcpConfigPath)
        ? ((JSON.parse(
              await readFile(mcpConfigPath, 'utf-8')
          ) as AntigravitySettings) ?? {})
        : {}

    let token: string | undefined = opts.token
    if (!token) {
        try {
            const tokenPath = join(homedir(), '.muninn', 'mcp.token')
            if (existsSync(tokenPath)) {
                token = (await readFile(tokenPath, 'utf-8')).trim()
            }
        } catch {
            // silently ignore read errors
        }
    }

    const next = mergeAntigravityMcpRegistration(existing, token)

    await writeFile(mcpConfigPath, JSON.stringify(next, null, 2) + '\n')
    log(`  write: ${mcpConfigPath}`)
}

/**
 * Merge the stage-gate PreToolUse registration into an existing
 * ClaudeSettings object. If an entry referencing the stage-gate hook
 * already exists anywhere under PreToolUse, this is a no-op (idempotent).
 *
 * Pure function — exported for testability.
 */
export function mergeStageGateRegistration(
    settings: ClaudeSettings
): ClaudeSettings {
    const next: ClaudeSettings = { ...settings }
    next.hooks = { ...(settings.hooks ?? {}) }
    const preToolUse = [...(next.hooks.PreToolUse ?? [])]

    // Idempotency: if any existing entry already references the stage-gate
    // hook (current bare command or a legacy stage-gate.sh wrapper), leave
    // the settings untouched.
    const alreadyRegistered = preToolUse.some((entry) =>
        entry.hooks?.some((h) => h.command?.includes('stage-gate'))
    )
    if (alreadyRegistered) {
        next.hooks.PreToolUse = preToolUse
        return next
    }

    preToolUse.push({
        matcher: CLAUDE_STAGE_GATE_MATCHER,
        hooks: [
            {
                type: 'command',
                command: STAGE_GATE_COMMAND,
                timeout: 30,
            },
        ],
    })

    next.hooks.PreToolUse = preToolUse
    return next
}

/**
 * Merge the stage-gate PreToolUse registration into an existing
 * AntigravityHooks object.
 */
export function mergeAntigravityHookRegistration(
    hooks: AntigravityHooks
): AntigravityHooks {
    const next: AntigravityHooks = { ...hooks }

    // Idempotency: check if 'luca-stage-gate' already exists
    if (next['luca-stage-gate']) {
        return next
    }

    next['luca-stage-gate'] = {
        enabled: true,
        PreToolUse: [
            {
                matcher: AGY_STAGE_GATE_MATCHER,
                hooks: [
                    {
                        type: 'command',
                        command: STAGE_GATE_COMMAND,
                        timeout: 30,
                    },
                ],
            },
        ],
    }

    return next
}

/**
 * Merge the MuninnDB MCP registration into an existing AntigravitySettings object.
 */
export function mergeAntigravityMcpRegistration(
    settings: AntigravitySettings,
    token?: string
): AntigravitySettings {
    const next: AntigravitySettings = { ...settings }
    next.mcpServers = { ...(settings.mcpServers ?? {}) }

    // Idempotency: check if 'muninn' already exists
    if (next.mcpServers.muninn) {
        return next
    }

    // Note: This uses the native SSE transport for MuninnDB via serverUrl.
    // The API key is sourced from ~/.muninn/mcp.token (from `muninn init`),
    // falling back to the legacy environment variable if missing.
    const authHeader = token ? `Bearer ${token}` : 'Bearer ${MUNINN_DB_API_KEY}'

    next.mcpServers.muninn = {
        serverUrl: 'http://127.0.0.1:8750/mcp',
        headers: {
            Authorization: authHeader,
        },
    }

    return next
}
