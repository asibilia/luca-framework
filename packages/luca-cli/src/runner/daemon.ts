/**
 * Persistent runner daemon (DAD-P2 thin POC).
 *
 * A resident Bun process that holds `createPipelineActorHandle` as a
 * re-derivable MIRROR of the pipeline position for one run, bound to a per-repo
 * unix socket. It is a STATE-HOLDER only:
 *
 *  - It routes every advance WRITE through the EXISTING
 *    `lucaStateAdvanceTool.handler` (decideAdvance + mutateState) → `state.json`
 *    parity is code-identity, never a re-implementation (anti-01/anti-03).
 *  - The actor NEVER writes `state.json`; it only `.send`s to mirror position
 *    AFTER a successful write (anti-03).
 *  - It spawns NO agents/subagents (anti-02).
 *  - It NEVER holds `.luca/state.json.lock` across requests — that lock is
 *    acquired + released per-mutation inside `mutateState` (anti-04).
 *  - It persists NO actor snapshot; the actor is re-seeded from
 *    `state.json.pipelineStep` on every (re)start (anti-05).
 *
 * The daemon holds the coarse `.luca/lock.json` (pipeline lock) for the run,
 * guarded by PID-liveness so a stale socket / dead-pid lock is reaped but a live
 * daemon is never clobbered.
 */
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'

import {
    acquirePipelineLock,
    createPipelineActorHandle,
    forcePipelineUnlock,
    isPipelinePidAlive,
    loadCurrentState,
    readPipelineLock,
    releasePipelineLock,
    type PipelineActorHandle,
} from '@alecsibilia/luca-core'

import { runnerSocketPath, sendRequest, type RunnerResponse } from './protocol.ts'

import { lucaStateAdvanceTool } from '../write-surface/index.ts'

/** Join a WriteResult's text blocks (mirrors runWriteHandler's output shape). */
function joinResultText(content: { type: string; text: string }[]): string {
    return content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
}

/**
 * Run the daemon in the foreground. Blocks (never resolves) until a `stop`
 * request or a termination signal, at which point it cleans up and exits.
 *
 * @throws when a LIVE runner already serves this repo, or the pipeline lock is
 *   held by a live pid — refuses to start rather than clobber a live run.
 */
export async function runDaemon(cwd: string): Promise<void> {
    const sockPath = runnerSocketPath(cwd)
    mkdirSync(dirname(sockPath), { recursive: true })

    // --- Stale-socket / lock guard (PID-liveness) -----------------------
    // Never unlink a live daemon's socket. If a lock is held by a live pid,
    // confirm whether it is actually a responsive runner on the socket; refuse
    // in either live case.
    const existingLock = readPipelineLock(cwd)
    if (
        existingLock &&
        existingLock.pid !== process.pid &&
        isPipelinePidAlive(existingLock.pid)
    ) {
        const ping = await sendRequest(cwd, { cmd: 'ping' }, 300)
        if (!('unreachable' in ping) && ping.ok) {
            throw new Error(
                `a live luca runner (pid ${existingLock.pid}) already serves ${sockPath}`
            )
        }
        throw new Error(
            `.luca/lock.json is held by live pid ${existingLock.pid}; refusing to start a second runner`
        )
    }

    // Reap a stale dead-pid lock, then remove any stale socket file.
    forcePipelineUnlock({ cwd })
    if (existsSync(sockPath)) {
        try {
            unlinkSync(sockPath)
        } catch {
            // best-effort
        }
    }

    // --- Acquire the coarse pipeline lock for the run -------------------
    const runId = `runner-${process.pid}`
    let acq = acquirePipelineLock({ cwd, runId })
    if (!acq.ok) {
        // A dead-pid holder that slipped past the guard — reap and retry once.
        forcePipelineUnlock({ cwd })
        acq = acquirePipelineLock({ cwd, runId })
        if (!acq.ok) {
            throw new Error(
                `could not acquire .luca/lock.json (held by pid ${acq.holder?.pid ?? '?'})`
            )
        }
    }

    // --- Seed the position mirror from state.json ----------------------
    const seedState = await loadCurrentState({ cwd })
    const handle: PipelineActorHandle = createPipelineActorHandle(
        seedState.pipelineStep
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let stopping = false
    const cleanup = (): void => {
        try {
            handle.stop()
        } catch {
            // best-effort
        }
        try {
            server?.stop(true)
        } catch {
            // best-effort
        }
        releasePipelineLock({ cwd, runId })
        // Reap our own lock unconditionally (runId match) in case release raced.
        forcePipelineUnlock({ cwd, runId })
        if (existsSync(sockPath)) {
            try {
                unlinkSync(sockPath)
            } catch {
                // best-effort
            }
        }
    }

    // Per-connection line buffers.
    const buffers = new WeakMap<object, string>()

    async function handleRequest(raw: string): Promise<RunnerResponse> {
        let req: unknown
        try {
            req = JSON.parse(raw)
        } catch {
            return { ok: false, kind: 'error', text: 'malformed request JSON' }
        }
        const cmd = (req as { cmd?: string }).cmd

        if (cmd === 'ping') {
            return { ok: true, kind: 'pong', pid: process.pid }
        }

        if (cmd === 'status') {
            const st = await loadCurrentState({ cwd })
            return {
                ok: true,
                kind: 'status',
                // Authoritative position + counters come from state.json — NOT
                // the mirror (the mirror tracks position only; counters are
                // written by mutateState).
                step: st.pipelineStep,
                mirrorStep: handle.contextSnapshot().step,
                counters: {
                    checksFixIteration: st.checksFixIteration,
                    verifyIteration: st.verifyIteration,
                    reviewIteration: st.reviewIteration,
                },
                pid: process.pid,
            }
        }

        if (cmd === 'stop') {
            stopping = true
            return { ok: true, kind: 'stop', text: 'runner stopping' }
        }

        if (cmd === 'advance') {
            const to = (req as { to?: string }).to
            // Validate via the SAME schema the cold client path uses, so a bad
            // step is rejected identically (parity).
            const parsed = lucaStateAdvanceTool.inputSchema.safeParse({
                toStep: to,
            })
            if (!parsed.success) {
                return {
                    ok: false,
                    kind: 'advance',
                    text: `invalid arguments — ${parsed.error.issues
                        .map((i) => i.message)
                        .join('; ')}`,
                }
            }
            // The WRITE goes through the existing cold handler (byte-identical
            // state.json). mutateState owns the state.json.lock per-call — the
            // daemon holds it for no longer than one advance (anti-04).
            const result = await lucaStateAdvanceTool.handler(parsed.data, {
                cwd,
            })
            const text = joinResultText(result.content)
            if (!result.isError) {
                // Mirror position ONLY after a successful write.
                handle.send(parsed.data.toStep)
            }
            return { ok: !result.isError, kind: 'advance', text }
        }

        return { ok: false, kind: 'error', text: `unknown command '${cmd}'` }
    }

    server = Bun.listen({
        unix: sockPath,
        socket: {
            data(socket, chunk): void {
                const prev = buffers.get(socket) ?? ''
                const buf = prev + chunk.toString()
                const nl = buf.indexOf('\n')
                if (nl === -1) {
                    buffers.set(socket, buf)
                    return
                }
                buffers.set(socket, buf.slice(nl + 1))
                const line = buf.slice(0, nl)
                void handleRequest(line).then((resp) => {
                    try {
                        socket.write(`${JSON.stringify(resp)}\n`)
                    } catch {
                        // client may have gone away
                    }
                    if (stopping) {
                        // Allow the response to flush, then tear down + exit.
                        setTimeout(() => {
                            cleanup()
                            process.exit(0)
                        }, 20)
                    }
                })
            },
            close(socket): void {
                buffers.delete(socket)
            },
        },
    })

    // Graceful teardown on signals so the lock + socket never leak.
    const onSignal = (): void => {
        cleanup()
        process.exit(0)
    }
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)

    console.log(
        `luca runner listening on ${sockPath} (pid ${process.pid}, step '${seedState.pipelineStep}')`
    )

    // Block forever — the listening socket + this pending promise keep the
    // event loop alive until `stop` / a signal calls process.exit.
    return new Promise<void>(() => {})
}
