/**
 * Doctor check: MuninnDB MCP wiring for Claude Code.
 *
 * The MuninnDB service (port 8476) being healthy is necessary but not
 * sufficient — the Luca pipeline reads/writes memory through MuninnDB's
 * MCP endpoint, which is served on a SEPARATE port (8750) and must be
 * registered with Claude Code as an MCP server. If it isn't wired, the
 * pipeline runs but silently loses cross-session memory.
 *
 * This check verifies BOTH signals:
 *   1. Reachability — is `http://127.0.0.1:8750/mcp` responding? (a 401 is
 *      a healthy "up, needs auth" answer; only a connection error counts
 *      as down.)
 *   2. Registration — is a `muninn` server present in the user `~/.claude.json`
 *      or the project `.mcp.json`?
 *
 * Informational (warning, never fail) — MuninnDB memory is optional, and
 * wiring requires an API key this check cannot supply, so there is no
 * automatic `fix()`.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { CheckResult, DoctorCheck } from '../types'

const CHECK_NAME = 'MuninnDB MCP wiring'

/** MuninnDB's MCP endpoint (fixed port, distinct from the 8476 service). */
const MCP_URL = 'http://127.0.0.1:8750/mcp'

const ADD_COMMAND =
    'claude mcp add --transport sse muninn http://localhost:8750/mcp ' +
    '--header "Authorization: Bearer <your-muninn-api-key>"'

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
async function isMuninnRegistered(cwd: string): Promise<boolean> {
    const projectMcp = await readJsonObject(join(cwd, '.mcp.json'))
    if (hasMuninnEntry(projectMcp?.mcpServers)) return true

    const userConfig = await readJsonObject(join(homedir(), '.claude.json'))
    if (hasMuninnEntry(userConfig?.mcpServers)) return true

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

/** Any HTTP response (incl. 401) means the MCP endpoint is up. */
async function isMcpReachable(): Promise<boolean> {
    try {
        await fetch(MCP_URL, {
            method: 'GET',
            signal: AbortSignal.timeout(2500),
        })
        return true
    } catch {
        return false
    }
}

export const muninnMcpCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'global',

    async run(): Promise<CheckResult> {
        const [reachable, registered] = await Promise.all([
            isMcpReachable(),
            isMuninnRegistered(process.cwd()),
        ])

        if (reachable && registered) {
            return {
                name: CHECK_NAME,
                status: 'pass',
                message: 'muninn MCP registered and reachable on :8750',
                fixCommand: null,
                details: null,
            }
        }

        if (reachable && !registered) {
            return {
                name: CHECK_NAME,
                status: 'warning',
                message: 'MuninnDB MCP is up but not registered with Claude Code',
                fixCommand: ADD_COMMAND,
                details: [
                    'The MCP endpoint on :8750 is reachable, but no `muninn`',
                    'server is registered, so the pipeline cannot use memory.',
                    'Register it (use the key from `luca vault:init` / .env):',
                    `  ${ADD_COMMAND}`,
                ].join('\n  '),
            }
        }

        if (!reachable && registered) {
            return {
                name: CHECK_NAME,
                status: 'warning',
                message: 'muninn MCP registered but endpoint unreachable on :8750',
                fixCommand: 'luca init',
                details: [
                    'A `muninn` server is registered, but nothing is answering',
                    'on :8750. Is MuninnDB running? Start it with `luca init`',
                    'or `muninn start`, then restart Claude Code.',
                ].join('\n  '),
            }
        }

        return {
            name: CHECK_NAME,
            status: 'warning',
            message: 'MuninnDB MCP not running and not registered (optional)',
            fixCommand: ADD_COMMAND,
            details: [
                'MuninnDB provides cross-session memory for the pipeline. It is',
                'optional, but recommended. Start it (`luca init`) and register',
                'the MCP server:',
                `  ${ADD_COMMAND}`,
            ].join('\n  '),
        }
    },
}
