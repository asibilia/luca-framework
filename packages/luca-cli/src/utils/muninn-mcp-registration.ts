/**
 * Detect whether a `muninn` MCP server is registered with Claude Code.
 *
 * A registered MuninnDB MCP server authenticates with a single, INSTANCE-level
 * API key and reaches EVERY vault — the vault is a per-tool-call parameter, not
 * an auth boundary. So one registration covers all current and future vaults.
 *
 * This is the signal the vault wizard uses to decide whether an API key still
 * needs capturing (if the server is already registered, it doesn't), and the
 * signal the `muninn-mcp` doctor check uses for its "registered?" half. Shared
 * here so the two stay in sync.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Read + parse a JSON object file; null on missing/unreadable/malformed. */
async function readJsonObject(
    path: string
): Promise<Record<string, unknown> | null> {
    try {
        const file = Bun.file(path)
        if (!(await file.exists())) return null
        const parsed = JSON.parse(await file.text()) as unknown
        return parsed !== null && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : null
    } catch {
        return null
    }
}

/** True when an `mcpServers` map contains a `muninn` entry. */
function hasMuninnEntry(mcpServers: unknown): boolean {
    return (
        mcpServers !== null &&
        typeof mcpServers === 'object' &&
        'muninn' in (mcpServers as Record<string, unknown>)
    )
}

/** Scan the user + project config surfaces for a registered `muninn` server. */
export async function isMuninnRegistered(cwd: string): Promise<boolean> {
    const projectMcp = await readJsonObject(join(cwd, '.mcp.json'))
    if (hasMuninnEntry(projectMcp?.mcpServers)) return true

    const userConfig = await readJsonObject(join(homedir(), '.claude.json'))
    if (hasMuninnEntry(userConfig?.mcpServers)) return true

    // Antigravity registers MCP servers in a dedicated mcp_config.json (the
    // wireAntigravityMcp writer's target) — NOT settings.json. Probe the
    // canonical file so this consumer stays in sync with the producer.
    const agyConfig = await readJsonObject(
        join(homedir(), '.gemini', 'antigravity-cli', 'mcp_config.json')
    )
    if (hasMuninnEntry(agyConfig?.mcpServers)) return true

    const projects = userConfig?.projects
    if (projects !== null && typeof projects === 'object') {
        const project = (projects as Record<string, unknown>)[cwd]
        if (
            project !== null &&
            typeof project === 'object' &&
            hasMuninnEntry((project as Record<string, unknown>).mcpServers)
        ) {
            return true
        }
    }
    return false
}
