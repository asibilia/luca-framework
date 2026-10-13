import { tmpdir } from 'node:os'

import { describe, expect, test } from 'bun:test'

import { runShell } from './run-command'

/**
 * A command that runs past its time limit is really stopped (#485): the
 * engine kills the shell and everything it started, and doesn't wait on
 * output pipes a leftover child still holds.
 */

/** Whether a process with this id still runs. */
const isRunning = (pid: number): boolean => {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

/** Waits up to `ms` for the process to go away; true if it did. */
const goneWithin = async (pid: number, ms: number): Promise<boolean> => {
    const end = Date.now() + ms
    while (Date.now() < end) {
        if (!isRunning(pid)) return true
        await Bun.sleep(50)
    }
    return !isRunning(pid)
}

/** The first line of the output, as a process id. */
const firstPid = (stdout: string): number =>
    Number.parseInt(stdout.trim().split('\n')[0] ?? '', 10)

describe('runShell', () => {
    test('a command that finishes in time gives its output and exit code', async () => {
        const result = await runShell({
            command: 'echo out; echo err >&2; exit 3',
            cwd: tmpdir(),
        })

        expect(result).toEqual({
            exit_code: 3,
            stdout: 'out\n',
            stderr: 'err\n',
            timed_out: false,
        })
    })

    test('a command past its time limit is stopped with the child it started, at once', async () => {
        const started = Date.now()
        const result = await runShell({
            // The child keeps running and holds the output pipe open.
            command: 'sleep 30 & echo $!; sleep 30',
            cwd: tmpdir(),
            timeout_ms: 300,
        })
        const took = Date.now() - started

        expect(result.timed_out).toBe(true)
        expect(result.exit_code).toBeNull()
        expect(took).toBeLessThan(5_000)
        const child = firstPid(result.stdout)
        expect(Number.isInteger(child)).toBe(true)
        expect(await goneWithin(child, 2_000)).toBe(true)
    }, 20_000)

    test("a child that left the command's process group cannot hold the engine on the output pipe", async () => {
        const started = Date.now()
        const result = await runShell({
            // perl starts a new session (out of reach of the group kill),
            // then becomes a sleep that keeps stdout open.
            command:
                'perl -MPOSIX -e "POSIX::setsid(); exec q(sleep), 20" & echo $!; sleep 20',
            cwd: tmpdir(),
            timeout_ms: 300,
        })
        const took = Date.now() - started
        const escaped = firstPid(result.stdout)
        if (Number.isInteger(escaped)) {
            try {
                process.kill(escaped, 'SIGKILL')
            } catch {
                // Already gone.
            }
        }

        expect(result.timed_out).toBe(true)
        expect(result.exit_code).toBeNull()
        expect(took).toBeLessThan(8_000)
    }, 30_000)
})
