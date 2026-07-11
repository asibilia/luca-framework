/**
 * Runner socket protocol (DAD-P2 thin POC).
 *
 * A newline-delimited JSON request/response protocol over a per-repo unix
 * socket at `.luca/tmp/runner.sock` (gitignored; created by `Bun.listen`, not a
 * Write tool → no `.luca/` contract change). Shared by the daemon
 * (`runner/daemon.ts`) and the `luca state advance` client route (`state.ts`).
 *
 * Framing: each message is a single JSON object terminated by `\n`. One
 * request, one response, then the connection closes.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Resolve the per-repo runner socket path. */
export function runnerSocketPath(cwd: string): string {
    return join(cwd, '.luca', 'tmp', 'runner.sock')
}

/**
 * A request sent from a client to the daemon.
 *
 * NOTE — no peer/session field: governance is enforced by the PreToolUse
 * stage-gate hook reading `state.json` (anti-07), NOT by the socket. The
 * daemon does not authenticate its peer; the sole trusted client is
 * `luca state advance`, a Bash command the hook has already gated. See the
 * trust-boundary note in `daemon.ts`.
 */
export type RunnerRequest =
    | { cmd: 'advance'; to: string }
    | { cmd: 'status' }
    | { cmd: 'stop' }
    | { cmd: 'ping' }

/** A response sent from the daemon back to a client. */
export interface RunnerResponse {
    ok: boolean
    /** Discriminator echoing the request kind. */
    kind: 'advance' | 'status' | 'stop' | 'pong' | 'error'
    /** Human-readable text (advance result / error message). */
    text?: string
    /** Authoritative pipelineStep from state.json (status). */
    step?: string
    /** Advisory mirror leaf from the actor (status introspection). */
    mirrorStep?: string
    /** Fix-loop counters from state.json (status; authoritative). */
    counters?: {
        checksFixIteration?: number
        verifyIteration?: number
        reviewIteration?: number
    }
    /** Daemon pid (status). */
    pid?: number
}

/** Sentinel returned when the daemon is not reachable (down / stale socket). */
export interface Unreachable {
    unreachable: true
}

/**
 * Send one request to the daemon and await its single response.
 *
 * Returns {@link Unreachable} on ENOENT / ECONNREFUSED / timeout — the caller
 * treats that as "daemon down" and falls through to the cold path. NEVER
 * throws: a down daemon is a normal, expected condition (anti-06).
 */
export async function sendRequest(
    cwd: string,
    req: RunnerRequest,
    timeoutMs = 500
): Promise<RunnerResponse | Unreachable> {
    const sockPath = runnerSocketPath(cwd)
    // Fast negative: no socket file at all.
    if (!existsSync(sockPath)) return { unreachable: true }

    return new Promise<RunnerResponse | Unreachable>((resolve) => {
        let buf = ''
        let settled = false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let sock: any
        const done = (r: RunnerResponse | Unreachable): void => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            try {
                sock?.end()
            } catch {
                // best-effort close
            }
            resolve(r)
        }
        const timer = setTimeout(() => done({ unreachable: true }), timeoutMs)

        Bun.connect({
            unix: sockPath,
            socket: {
                open(socket): void {
                    socket.write(`${JSON.stringify(req)}\n`)
                },
                data(_socket, chunk): void {
                    buf += chunk.toString()
                    const nl = buf.indexOf('\n')
                    if (nl === -1) return
                    const line = buf.slice(0, nl)
                    try {
                        done(JSON.parse(line) as RunnerResponse)
                    } catch {
                        done({ unreachable: true })
                    }
                },
                error(): void {
                    done({ unreachable: true })
                },
                close(): void {
                    // If closed before a full line arrived, treat as unreachable.
                    done({ unreachable: true })
                },
            },
        })
            .then((s) => {
                sock = s
            })
            .catch(() => done({ unreachable: true }))
    })
}
