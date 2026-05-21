import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface WireMcpServerOptions {
    cwd: string
    log?: (msg: string) => void
}

interface McpServerEntry {
    command: string
    args?: string[]
}

interface ClaudeSettings {
    mcpServers?: Record<string, McpServerEntry>
    [k: string]: unknown
}

const LUCA_SERVER_ENTRY: McpServerEntry = {
    command: 'luca',
    args: ['mcp', 'serve'],
}

/**
 * Merge the luca MCP server registration into a ClaudeSettings object.
 * Pure function — exported for testability. Overwrites any stale luca entry
 * so re-running `luca init` always produces the current canonical command.
 */
export function mergeMcpServerRegistration(
    settings: ClaudeSettings
): ClaudeSettings {
    const next: ClaudeSettings = { ...settings }
    next.mcpServers = { ...(settings.mcpServers ?? {}) }
    next.mcpServers.luca = LUCA_SERVER_ENTRY
    return next
}

/**
 * Wire the luca MCP server entry into the project's .claude/settings.json.
 *
 * Claude Code reads mcpServers from settings.json on session start and
 * spawns each registered server with the given command + args. The luca
 * server is started via `luca mcp serve` and provides the deterministic
 * write tools that mediate .luca/ writes.
 */
export async function wireMcpServer(opts: WireMcpServerOptions): Promise<void> {
    const log = opts.log ?? (() => {})
    const claudeDir = join(opts.cwd, '.claude')
    const settingsPath = join(claudeDir, 'settings.json')

    await mkdir(claudeDir, { recursive: true })

    const existing = existsSync(settingsPath)
        ? ((JSON.parse(
              await readFile(settingsPath, 'utf-8')
          ) as ClaudeSettings) ?? {})
        : {}

    const next = mergeMcpServerRegistration(existing)

    await writeFile(settingsPath, JSON.stringify(next, null, 2) + '\n')
    log(`  write: ${settingsPath} (mcpServers.luca registered)`)
}
