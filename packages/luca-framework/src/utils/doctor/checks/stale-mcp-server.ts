/**
 * Doctor check: stale luca MCP server registration.
 *
 * Before v13 the luca write surface was an MCP server started via
 * `luca mcp serve`. v13 removed that command — the write surface is now
 * the `luca` CLI plus the agent's native Write tool. A registration left
 * behind by an older `luca init`, or by a manual `claude mcp add`, now
 * points at a command that no longer exists. This check finds such a
 * registration so it can be cleared with `claude mcp remove luca`.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { CheckResult, DoctorCheck } from '../types'

const CHECK_NAME = 'MCP server registration'

/** True when an mcpServers entry starts the (removed) `luca mcp serve`. */
function isLucaMcpEntry(entry: unknown): boolean {
    if (entry === null || typeof entry !== 'object') return false
    const { command, args } = entry as { command?: unknown; args?: unknown }
    if (command !== 'luca') return false
    return Array.isArray(args) && args.map(String).includes('mcp')
}

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
        // A missing or malformed config is not this check's concern.
        return null
    }
}

/** Names of mcpServers entries that point at `luca mcp serve`. */
function lucaServerKeys(mcpServers: unknown): string[] {
    if (mcpServers === null || typeof mcpServers !== 'object') return []
    return Object.entries(mcpServers as Record<string, unknown>)
        .filter(([, value]) => isLucaMcpEntry(value))
        .map(([key]) => key)
}

/**
 * Doctor check: verify no stale `luca mcp serve` MCP registration remains.
 *
 * Scans the project `.mcp.json`, the project `.claude/settings.json`, and
 * the user `~/.claude.json` (top-level and per-project sections). Reports
 * a warning — not a failure — since a leftover registration is cleanup
 * debris, not a broken environment.
 */
export const staleMcpServerCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'prerequisites',

    async run(): Promise<CheckResult> {
        const cwd = process.cwd()
        const findings: string[] = []
        let inertSettingsEntry = false

        // Project .mcp.json — the real registration written by `luca init`.
        const mcpJson = await readJsonObject(join(cwd, '.mcp.json'))
        for (const key of lucaServerKeys(mcpJson?.mcpServers)) {
            findings.push(`.mcp.json (mcpServers.${key})`)
        }

        // Project .claude/settings.json — Claude Code never read mcpServers
        // here, so any entry is inert, but it is still stale debris.
        const settings = await readJsonObject(
            join(cwd, '.claude', 'settings.json')
        )
        for (const key of lucaServerKeys(settings?.mcpServers)) {
            findings.push(`.claude/settings.json (mcpServers.${key}, inert)`)
            inertSettingsEntry = true
        }

        // User ~/.claude.json — top-level and per-project (local-scope).
        const userConfig = await readJsonObject(join(homedir(), '.claude.json'))
        for (const key of lucaServerKeys(userConfig?.mcpServers)) {
            findings.push(`~/.claude.json (mcpServers.${key})`)
        }
        const projects = userConfig?.projects
        if (projects !== null && typeof projects === 'object') {
            const project = (projects as Record<string, unknown>)[cwd]
            if (project !== null && typeof project === 'object') {
                for (const key of lucaServerKeys(
                    (project as Record<string, unknown>).mcpServers
                )) {
                    findings.push(
                        `~/.claude.json (projects[cwd].mcpServers.${key})`
                    )
                }
            }
        }

        if (findings.length === 0) {
            return {
                name: CHECK_NAME,
                status: 'pass',
                message: 'no stale luca MCP server registration',
                fixCommand: null,
                details: null,
            }
        }

        const detailLines = [
            '`luca mcp serve` was removed in v13 — the write surface is now',
            'the `luca` CLI plus the native Write tool. Stale registration in:',
            ...findings.map((finding) => `- ${finding}`),
        ]
        if (inertSettingsEntry) {
            detailLines.push(
                '`claude mcp remove luca` clears .mcp.json and ~/.claude.json.',
                'The .claude/settings.json block is inert — remove it by hand.'
            )
        }

        return {
            name: CHECK_NAME,
            status: 'warning',
            message: 'stale luca MCP server still registered (removed in v13)',
            fixCommand: 'claude mcp remove luca',
            details: detailLines.join('\n  '),
        }
    },
}
