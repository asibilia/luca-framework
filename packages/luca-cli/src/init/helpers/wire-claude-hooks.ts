import { chmodSync, existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { readMuninnToken } from '../../utils/muninn-token.ts'
import { defaultAntigravityHome, defaultClaudeHome } from './install-skills.ts'

/**
 * MuninnDB MCP server endpoint (Streamable-HTTP transport). Hoisted to a
 * single module-level const so the idempotency/correctness check and the entry
 * write in `mergeAntigravityMcpRegistration` can never drift apart.
 */
const MUNINN_MCP_SERVER_URL = 'http://127.0.0.1:8750/mcp'

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
            command?: string
            args?: string[]
            env?: Record<string, string>
            serverUrl?: string
            headers?: Record<string, string>
            enabledTools?: string[]
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
 * The user's *primary* Claude Code config (`~/.claude.json`). Far more than MCP
 * lives here (projects, history, theme, …), so the type carries a
 * `[k: string]: unknown` passthrough and the merge spreads every key through.
 *
 * Claude's MCP entry shape is the canonical SSE transport
 * (`{ type: 'sse', url, headers }`) — DISTINCT from Antigravity's
 * `serverUrl`/`enabledTools` shape. The optional Antigravity-style keys are
 * declared only so the merge can destructure-omit them when migrating a stale
 * cross-contaminated entry.
 */
interface ClaudeUserConfig {
    mcpServers?: Record<
        string,
        {
            type?: string
            url?: string
            headers?: Record<string, string>
            command?: string
            args?: string[]
            env?: Record<string, string>
        }
    >
    [k: string]: unknown
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
 * Register the MuninnDB MCP server in the *global* Antigravity MCP config
 * (`~/.gemini/antigravity-cli/mcp_config.json`).
 *
 * WS2: Antigravity reads its MCP server registry from a *dedicated*
 * `mcp_config.json` file — NOT from the agent settings file's `mcpServers`
 * key (that is the legacy Gemini-CLI surface and Antigravity ignores it).
 * Antigravity also does NOT interpolate environment variables in this config,
 * so the MuninnDB token must be written inline (a literal `Bearer <token>`
 * header), never an env-var placeholder.
 */
export async function wireAntigravityMcp(
    opts: WireClaudeHooksOptions = {}
): Promise<void> {
    const log = opts.log ?? (() => {})
    const agyHome = opts.home ?? defaultAntigravityHome()
    const mcpConfigPath = join(agyHome, 'mcp_config.json')

    await mkdir(agyHome, { recursive: true })

    // Three-case read guard (mirrors wireClaudeMcp). Lower stakes than the
    // primary Claude config, but the {}-fallback-then-write pattern is the same
    // clobber bug class — a present-but-unparseable mcp_config.json must NOT be
    // overwritten with a `{}`-derived config:
    //  1. absent OR whitespace-only  → `{}` (safe first run).
    //  2. present, non-empty, parses → use parsed object.
    //  3. present, non-empty, throws → ABORT before any write.
    let existing: AntigravitySettings = {}
    if (existsSync(mcpConfigPath)) {
        const raw = await readFile(mcpConfigPath, 'utf-8')
        if (raw.trim().length === 0) {
            existing = {}
        } else {
            try {
                existing = (JSON.parse(raw) as AntigravitySettings) ?? {}
            } catch {
                log(
                    '  skip: Antigravity MCP not registered — mcp_config.json is present but not valid JSON.\n' +
                        '        Skipping to avoid overwriting it. Fix the file and re-run `luca init`.'
                )
                return
            }
        }
    }

    const token = opts.token ?? (await readMuninnToken())

    // D3: never write a partial config. Antigravity inlines the token (no env
    // interpolation), so without a present token we'd emit a useless server
    // entry. Gate here and surface actionable guidance instead. The `return`
    // narrows `token` to `string` for the merge call below.
    if (!token) {
        log(
            '  skip: Antigravity MCP not registered — no MuninnDB token found.\n' +
                "        Run `muninn init` to generate ~/.muninn/mcp.token, then re-run `luca init`."
        )
        return
    }

    const next = mergeAntigravityMcpRegistration(existing, token)

    // The config inlines the MuninnDB token (Bearer <token>); create it
    // owner-read/write-only FROM INCEPTION so the token is never world-readable
    // even briefly. chmodSync remains belt-and-suspenders for a pre-existing
    // inode (mirrors writeApiKeyToEnv SEC-002).
    await writeFile(mcpConfigPath, JSON.stringify(next, null, 2) + '\n', {
        mode: 0o600,
    })
    chmodSync(mcpConfigPath, 0o600)
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
    token: string
): AntigravitySettings {
    const next: AntigravitySettings = { ...settings }
    next.mcpServers = { ...(settings.mcpServers ?? {}) }

    // Antigravity does not interpolate env vars in mcp_config.json, so the
    // token is inlined directly into the Authorization header.
    const authHeader = `Bearer ${token}`

    // Idempotency / correctness: leave the entry untouched only when ALL of
    // the canonical invariants already hold — Streamable-HTTP serverUrl, the
    // exact inlined token, the `*` tool allowlist, and no stale `url` key from
    // an older SSE-transport config.
    const existing = next.mcpServers.muninn
    if (
        existing &&
        existing.serverUrl === MUNINN_MCP_SERVER_URL &&
        existing.headers?.Authorization === authHeader &&
        Array.isArray(existing.enabledTools) &&
        existing.enabledTools.includes('*') &&
        !('url' in (existing as Record<string, unknown>))
    ) {
        return next
    }

    // Merge-not-replace: preserve any user-set headers and other fields while
    // dropping the stale `url` key (legacy SSE transport — Antigravity uses
    // Streamable-HTTP via `serverUrl`). `url` is not part of the canonical
    // type, so omit it via a record-typed destructure.
    const { url: _drop, ...rest } = (existing ?? {}) as Record<string, unknown>
    void _drop

    // enabledTools: ['*'] is load-bearing. Without it Antigravity rejects tool
    // calls with `tool muninn_recall is not enabled for server muninn`.
    next.mcpServers.muninn = {
        ...rest,
        serverUrl: MUNINN_MCP_SERVER_URL,
        headers: {
            ...(existing?.headers ?? {}),
            Authorization: authHeader,
        },
        enabledTools: ['*'],
    }

    return next
}

/**
 * Merge the MuninnDB MCP registration into the user's primary Claude config
 * (`~/.claude.json`). Pure — exported for testability.
 *
 * Claude uses the canonical SSE transport entry shape
 * (`{ type: 'sse', url, headers: { Authorization } }`) under top-level
 * `mcpServers`, DISTINCT from Antigravity's `serverUrl`/`enabledTools`. When a
 * stale entry carries Antigravity-shape keys (`serverUrl`/`enabledTools`) from
 * an earlier cross-contaminated write, they are destructure-omitted so the
 * Claude entry stays canonical.
 *
 * Merge-not-replace: every other top-level config key AND every other
 * `mcpServers` entry is spread through untouched. `~/.claude.json` is the user's
 * PRIMARY config — clobbering it is catastrophic.
 */
export function mergeClaudeMcpRegistration(
    config: ClaudeUserConfig,
    token: string
): ClaudeUserConfig {
    const next: ClaudeUserConfig = { ...config }
    next.mcpServers = { ...(config.mcpServers ?? {}) }

    const authHeader = `Bearer ${token}`
    const existing = next.mcpServers.muninn as
        | Record<string, unknown>
        | undefined

    // Idempotency / correctness: leave the entry untouched only when ALL of the
    // canonical Claude invariants already hold — SSE transport, the matching
    // url, the exact inlined token, and NO stale Antigravity-shape keys.
    if (
        existing &&
        existing.type === 'sse' &&
        existing.url === MUNINN_MCP_SERVER_URL &&
        (existing.headers as Record<string, string> | undefined)
            ?.Authorization === authHeader &&
        !('serverUrl' in existing) &&
        !('enabledTools' in existing)
    ) {
        return next
    }

    // Migrate-not-clobber: preserve any user-set fields/headers while dropping
    // the cross-contaminating Antigravity-shape keys (serverUrl/enabledTools).
    const {
        serverUrl: _dropServerUrl,
        enabledTools: _dropEnabledTools,
        ...rest
    } = existing ?? {}
    void _dropServerUrl
    void _dropEnabledTools

    next.mcpServers.muninn = {
        ...rest,
        type: 'sse',
        url: MUNINN_MCP_SERVER_URL,
        headers: {
            ...((existing?.headers as Record<string, string> | undefined) ?? {}),
            Authorization: authHeader,
        },
    }

    return next
}

/**
 * Register the MuninnDB MCP server in the user's *primary* Claude config
 * (`~/.claude.json`, NOT `~/.claude/settings.json`).
 *
 * WS4: this is a global file-merge that replaces the old per-project
 * `claude mcp add` shell-out. Because `~/.claude.json` holds far more than MCP
 * (projects, history, …), the write is merge-only and atomic:
 *
 *  - Three-case read guard: absent/whitespace-only → `{}`; present + parses →
 *    parsed object; present-non-empty + parse THROWS → ABORT (log + return)
 *    rather than clobber a hand-edited-but-malformed primary config.
 *  - Resolve the token via `opts.token ?? readMuninnToken()`; skip+log
 *    actionable guidance and `return` BEFORE any write when absent (D3 — never
 *    emit a partial/placeholder entry; Claude does not interpolate env vars
 *    here).
 *  - Write to a temp file in the same directory then `rename` over the target
 *    (atomic replace — a crash mid-write can't truncate the primary config).
 *  - chmod 0600 (the file now holds a Bearer token) but never LOOSEN a stricter
 *    existing mode.
 */
export async function wireClaudeMcp(
    opts: WireClaudeHooksOptions = {}
): Promise<void> {
    const log = opts.log ?? (() => {})
    const configPath = join(homedir(), '.claude.json')

    // Three-case read guard — `~/.claude.json` is the user's PRIMARY config, so
    // a parse failure must NEVER fall back to `{}` and clobber it:
    //  1. file absent OR whitespace-only  → `{}` (safe, normal first run).
    //  2. present, non-empty, parses       → use the parsed object.
    //  3. present, non-empty, parse THROWS → ABORT before any write/rename.
    // The atomic rename makes a clobber total, so a hand-edited-but-malformed
    // config (trailing comma, comment) must not be overwritten.
    let existing: ClaudeUserConfig = {}
    if (existsSync(configPath)) {
        const raw = await readFile(configPath, 'utf-8')
        if (raw.trim().length === 0) {
            existing = {}
        } else {
            try {
                existing = (JSON.parse(raw) as ClaudeUserConfig) ?? {}
            } catch {
                log(
                    '  skip: Claude MCP not registered — ~/.claude.json is present but not valid JSON.\n' +
                        '        Skipping to avoid overwriting it. Fix the file and re-run `luca init`.'
                )
                return
            }
        }
    }

    const token = opts.token ?? (await readMuninnToken())

    // D3: never write a partial config. Claude inlines the token (no env
    // interpolation), so without a present token we'd emit a useless entry.
    // Gate here and surface actionable guidance instead. The `return` narrows
    // `token` to `string` for the merge call below.
    if (!token) {
        log(
            '  skip: Claude MCP not registered — no MuninnDB token found.\n' +
                "        Run `muninn init` to generate ~/.muninn/mcp.token, then re-run `luca init`."
        )
        return
    }

    const next = mergeClaudeMcpRegistration(existing, token)

    // Determine the post-write mode: tighten to 0600 (the file now holds a
    // Bearer token) but never LOOSEN a stricter existing mode.
    let mode = 0o600
    if (existsSync(configPath)) {
        const existingMode = statSync(configPath).mode & 0o777
        if (existingMode < mode) {
            mode = existingMode
        }
    }

    // Atomic write: serialize to a temp file in the same directory, then rename
    // over the target. rename(2) within a filesystem is atomic, so a crash
    // mid-write cannot truncate ~/.claude.json (the user's primary config).
    const tmpPath = join(
        homedir(),
        `.claude.json.luca-${process.pid}-${Date.now()}.tmp`
    )
    try {
        // SEC: create the temp restrictive FROM INCEPTION — it holds a Bearer
        // token, so it must never exist in a world-readable (0644) state. The
        // chmodSync below is belt-and-suspenders for a pre-existing inode whose
        // mode the `mode:` open flag would not retighten.
        await writeFile(tmpPath, JSON.stringify(next, null, 2) + '\n', { mode })
        chmodSync(tmpPath, mode)
        await rename(tmpPath, configPath)
    } catch (err) {
        // Never leave an orphaned token-bearing temp behind on failure.
        await unlink(tmpPath).catch(() => {})
        throw err
    }
    log(`  write: ${configPath}`)
}
