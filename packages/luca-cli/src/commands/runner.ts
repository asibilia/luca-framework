/**
 * CLI commands: `luca start` / `luca stop` / `luca status` (DAD-P2 thin POC).
 *
 * `start` runs the persistent runner daemon in the foreground (it blocks on the
 * unix socket until `stop` or a signal). `stop` asks a running daemon to tear
 * down (and sweeps a stale lock/socket if none is up). `status` reports the
 * authoritative pipeline position from `state.json` (daemon-up or -down).
 *
 * The daemon is a state-holder only — it spawns no agents and routes every
 * write through the existing cold advance handler. See `runner/daemon.ts`.
 */
import { existsSync, unlinkSync } from 'node:fs'

import {
    forcePipelineUnlock,
    loadCurrentState,
    stringifyError,
} from '@alecsibilia/luca-core'
import { defineCommand } from 'citty'

import { rejectUnknownFlags } from './write-surface/__helpers/run-handler.ts'

import { runDaemon } from '../runner/daemon.ts'
import { runnerSocketPath, sendRequest } from '../runner/protocol.ts'

export const startCommand = defineCommand({
    meta: {
        name: 'start',
        description:
            'Start the persistent Luca runner (DAD-P2 POC). Holds the pipeline ' +
            'actor on a per-repo unix socket and routes advances through the ' +
            'cold write path. Blocks in the foreground until `luca stop`.',
    },
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('start', cmd, rawArgs)
        try {
            await runDaemon(process.cwd())
        } catch (err) {
            console.error(`luca start: ${stringifyError(err)}`)
            process.exit(1)
        }
    },
})

export const stopCommand = defineCommand({
    meta: {
        name: 'stop',
        description:
            'Stop the persistent Luca runner and remove its lock + socket. ' +
            'Sweeps a stale dead-pid lock/socket if no daemon is running.',
    },
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('stop', cmd, rawArgs)
        const cwd = process.cwd()
        const sockPath = runnerSocketPath(cwd)

        const resp = await sendRequest(cwd, { cmd: 'stop' }, 500)
        const reachable = !('unreachable' in resp)

        // Whether or not a daemon answered, guarantee the lock + socket are
        // gone: a live daemon's stop handler reaps them, but we also
        // dead-pid-reap + unlink to cover a crashed/absent daemon (ac-08).
        if (reachable) {
            // Give the daemon a moment to release its own lock, then sweep.
            for (let i = 0; i < 20 && existsSync(sockPath); i++) {
                await new Promise((r) => setTimeout(r, 25))
            }
        }
        forcePipelineUnlock({ cwd })
        if (existsSync(sockPath)) {
            try {
                unlinkSync(sockPath)
            } catch {
                // best-effort
            }
        }

        console.log(
            reachable
                ? 'luca stop: runner stopped; lock + socket removed.'
                : 'luca stop: no running runner; swept stale lock/socket if any.'
        )
        process.exit(0)
    },
})

export const statusCommand = defineCommand({
    meta: {
        name: 'status',
        description:
            'Report the runner + workflow status: pipelineStep and fix-loop ' +
            'counters from state.json (authoritative), plus whether a runner ' +
            'is live.',
    },
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('status', cmd, rawArgs)
        const cwd = process.cwd()
        const resp = await sendRequest(cwd, { cmd: 'status' }, 500)

        if (!('unreachable' in resp) && resp.ok) {
            const c = resp.counters ?? {}
            console.log(
                `runner: LIVE (pid ${resp.pid})\n` +
                    `pipelineStep: ${resp.step} (mirror: ${resp.mirrorStep})\n` +
                    `counters: checksFix=${c.checksFixIteration ?? 0} ` +
                    `verify=${c.verifyIteration ?? 0} review=${c.reviewIteration ?? 0}`
            )
            process.exit(0)
        }

        // Daemon down — report the cold status from state.json.
        const st = await loadCurrentState({ cwd })
        console.log(
            `runner: down\n` +
                `pipelineStep: ${st.pipelineStep}\n` +
                `counters: checksFix=${st.checksFixIteration ?? 0} ` +
                `verify=${st.verifyIteration ?? 0} review=${st.reviewIteration ?? 0}`
        )
        process.exit(0)
    },
})
