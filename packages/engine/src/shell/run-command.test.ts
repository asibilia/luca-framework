import { tmpdir } from 'node:os'

import { describe, expect, test } from 'bun:test'

import { runShell, timedOutLine } from './run-command'

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

/** Kills a process a test left behind, if it still runs. */
const killQuietly = (pid: number): void => {
    if (!Number.isInteger(pid)) return
    try {
        process.kill(pid, 'SIGKILL')
    } catch {
        // Already gone.
    }
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
            // A short grace keeps this a fast test (#580); the escaped child
            // still holds the pipe for 20 seconds.
            pipe_grace_ms: 200,
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
        // The time limit and the grace, with room: far from the 20 seconds
        // the escaped child holds the pipe, and inside a fast test's limit.
        expect(took).toBeLessThan(1_500)
    }, 30_000)

    test('a child that started its own process group is no longer running after a timeout', async () => {
        const result = await runShell({
            // perl leaves the shell's group for one of its own, then becomes
            // a sleep, like a test's server holding ports (#571).
            command:
                'perl -e "setpgrp(0,0); exec q(sleep), 20" & echo $!; sleep 20',
            cwd: tmpdir(),
            timeout_ms: 300,
            pipe_grace_ms: 200,
        })
        const child = firstPid(result.stdout)
        const gone = await goneWithin(child, 2_000)
        killQuietly(child)

        expect(result.timed_out).toBe(true)
        expect(Number.isInteger(child)).toBe(true)
        expect(gone).toBe(true)
    }, 30_000)

    test('a timeout stops a grandchild in its own process group under a child in another', async () => {
        const result = await runShell({
            // The child takes a group of its own, then forks a grandchild
            // that takes yet another; only a walk by parent id finds both.
            command: `perl -e '$| = 1; setpgrp(0,0); my $p = fork(); if ($p == 0) { setpgrp(0,0); exec "sleep", "20" } print "$$ $p\\n"; sleep 20' & sleep 20`,
            cwd: tmpdir(),
            timeout_ms: 500,
            pipe_grace_ms: 200,
        })
        const pids = (result.stdout.trim().split('\n')[0] ?? '')
            .split(' ')
            .map((text) => Number.parseInt(text, 10))
        const gone = await Promise.all(
            pids.map((pid) => goneWithin(pid, 2_000))
        )
        for (const pid of pids) killQuietly(pid)

        expect(result.timed_out).toBe(true)
        expect(pids).toHaveLength(2)
        expect(pids.every((pid) => Number.isInteger(pid))).toBe(true)
        expect(gone).toEqual([true, true])
    }, 30_000)

    test('a timeout that stopped everything names no survivors and keeps its message', async () => {
        const result = await runShell({
            command: 'sleep 20 & sleep 20',
            cwd: tmpdir(),
            timeout_ms: 300,
        })

        expect(result.timed_out).toBe(true)
        expect(result.survivors).toEqual([])
        expect(
            timedOutLine({
                timeout_ms: 300,
                hint: 'To give it longer, raise `test_timeout_ms`.',
                survivors: result.survivors,
            })
        ).toBe(
            'Timed out after 0.3 seconds, so the engine stopped it and everything it started. To give it longer, raise `test_timeout_ms`.\n'
        )
    }, 30_000)
})

describe('timedOutLine', () => {
    test('names each process still running after the kill', () => {
        const line = timedOutLine({
            timeout_ms: 300_000,
            hint: 'To give it longer, raise `test_timeout_ms`.',
            survivors: [
                { pid: 1234, command: 'node server.js' },
                { pid: 5678, command: 'sleep 20' },
            ],
        })

        expect(line.startsWith('Timed out after 5 minutes')).toBe(true)
        expect(line).toContain(
            'These were still running after the kill: pid 1234 (node server.js), pid 5678 (sleep 20)'
        )
        expect(line).toContain('To give it longer, raise `test_timeout_ms`.')
        expect(line).not.toContain('everything it started')
    })
})
