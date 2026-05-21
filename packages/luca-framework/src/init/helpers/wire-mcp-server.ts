import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface WireMcpServerOptions {
    cwd: string
    log?: (msg: string) => void
}

interface McpServerEntry {
    command: string
    args?: string[]
}

interface McpJson {
    mcpServers?: Record<string, McpServerEntry>
    [k: string]: unknown
}

const LUCA_SERVER_ENTRY: McpServerEntry = {
    command: 'luca',
    args: ['mcp', 'serve'],
}

/**
 * Merge the luca MCP server registration into a .mcp.json object.
 * Pure function — exported for testability. Overwrites any stale luca entry
 * so re-running `luca init` always produces the current canonical command.
 */
export function mergeMcpServerRegistration(config: McpJson): McpJson {
    const next: McpJson = { ...config }
    next.mcpServers = { ...(config.mcpServers ?? {}) }
    next.mcpServers.luca = LUCA_SERVER_ENTRY
    return next
}

/**
 * Strip a stale `mcpServers` key from .claude/settings.json.
 *
 * Earlier `luca init` versions wrote the MCP registration into
 * .claude/settings.json — but Claude Code never reads `mcpServers` from
 * settings.json (it only honors `.mcp.json` and the user/local config).
 * Leaving the dead key there is misleading, so re-running `luca init`
 * cleans it up. Other settings.json keys (hooks, permissions, …) are
 * preserved untouched.
 */
async function removeStaleSettingsEntry(
    cwd: string,
    log: (msg: string) => void
): Promise<void> {
    const settingsPath = join(cwd, '.claude', 'settings.json')
    if (!existsSync(settingsPath)) return

    let settings: Record<string, unknown>
    try {
        settings = JSON.parse(await readFile(settingsPath, 'utf-8')) as Record<
            string,
            unknown
        >
    } catch {
        // A corrupt settings.json is not this function's concern — leave it.
        return
    }

    if (
        settings != null &&
        typeof settings === 'object' &&
        'mcpServers' in settings
    ) {
        delete settings.mcpServers
        await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n')
        log(
            `  clean: ${settingsPath} (removed stale mcpServers key — Claude Code reads .mcp.json, not settings.json)`
        )
    }
}

/**
 * Wire the luca MCP server entry into the project's .mcp.json.
 *
 * Claude Code reads MCP server definitions from `.mcp.json` at the repo
 * root (project scope) on session start and spawns each registered server
 * with the given command + args. The luca server is started via
 * `luca mcp serve` and provides the deterministic write tools that mediate
 * .luca/ writes.
 *
 * NOTE: `mcpServers` in `.claude/settings.json` is NOT read by Claude Code —
 * `.mcp.json` is the project-scoped MCP config file. Any stale entry left in
 * settings.json by older `luca init` versions is removed here.
 */
export async function wireMcpServer(opts: WireMcpServerOptions): Promise<void> {
    const log = opts.log ?? (() => {})
    const mcpJsonPath = join(opts.cwd, '.mcp.json')

    let existing: McpJson = {}
    if (existsSync(mcpJsonPath)) {
        try {
            existing =
                (JSON.parse(await readFile(mcpJsonPath, 'utf-8')) as McpJson) ??
                {}
        } catch (err) {
            // A corrupt .mcp.json must not make `luca init` unrecoverable —
            // fall back to an empty object and rewrite.
            log(
                `  warn:  ${mcpJsonPath} is not valid JSON — ignoring it and writing fresh config (${(err as Error).message})`
            )
            existing = {}
        }
    }

    const next = mergeMcpServerRegistration(existing)

    await writeFile(mcpJsonPath, JSON.stringify(next, null, 2) + '\n')
    log(`  write: ${mcpJsonPath} (mcpServers.luca registered)`)

    await removeStaleSettingsEntry(opts.cwd, log)
}
