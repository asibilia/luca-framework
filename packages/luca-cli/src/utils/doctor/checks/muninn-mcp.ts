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
import { isMuninnRegistered } from '../../muninn-mcp-registration'
import type { CheckResult, DoctorCheck } from '../types'

const CHECK_NAME = 'MuninnDB MCP wiring'

/** MuninnDB's MCP endpoint (fixed port, distinct from the 8476 service). */
const MCP_URL = 'http://127.0.0.1:8750/mcp'

// Primary remediation: re-running `luca init` auto-registers MuninnDB for every
// installed harness (Claude global file-merge into ~/.claude.json + Antigravity
// mcp_config.json), sourcing the token from ~/.muninn/mcp.token. The manual
// `claude mcp add` below is a Claude-only fallback for when automation is skipped.
const FIX_COMMAND = 'luca init'

const MANUAL_ADD_COMMAND =
    'claude mcp add --transport sse muninn http://localhost:8750/mcp ' +
    '--header "Authorization: Bearer <your-muninn-api-key>"'

/**
 * True only when `:8750/mcp` answers like the MuninnDB MCP endpoint: a 2xx,
 * or a 401/403 when it requires the Bearer token (the unauthenticated probe
 * here). Any other status (404, 5xx, …) means some OTHER process is bound to
 * the port — not MuninnDB — so we do NOT count it as reachable, avoiding a
 * false PASS. A connection error (nothing listening) is also unreachable.
 */
async function isMcpReachable(): Promise<boolean> {
    try {
        const res = await fetch(MCP_URL, {
            method: 'GET',
            signal: AbortSignal.timeout(2500),
        })
        return (
            (res.status >= 200 && res.status < 300) ||
            res.status === 401 ||
            res.status === 403
        )
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
                message: 'MuninnDB MCP is up but not registered',
                fixCommand: FIX_COMMAND,
                details: [
                    'The MCP endpoint on :8750 is reachable, but no `muninn`',
                    'server is registered, so the pipeline cannot use memory.',
                    'Re-run `luca init` to auto-register it for every installed',
                    'harness (Claude + Antigravity). Manual Claude-only fallback:',
                    `  ${MANUAL_ADD_COMMAND}`,
                ].join('\n  '),
            }
        }

        if (!reachable && registered) {
            return {
                name: CHECK_NAME,
                status: 'warning',
                message:
                    'muninn MCP registered but endpoint unreachable on :8750',
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
            fixCommand: FIX_COMMAND,
            details: [
                'MuninnDB provides cross-session memory for the pipeline. It is',
                'optional, but recommended. Start it and run `luca init`, which',
                'auto-registers it for every installed harness (Claude +',
                'Antigravity). Manual Claude-only fallback:',
                `  ${MANUAL_ADD_COMMAND}`,
            ].join('\n  '),
        }
    },
}
