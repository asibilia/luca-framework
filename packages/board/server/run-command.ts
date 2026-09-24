import { execFile } from 'node:child_process'

import type { RunCommand } from './board-server'

/** What a shell reports when a command can't be started. */
const COULD_NOT_START = 127

/**
 * Runs a command to its end with `execFile` (no shell) and a timeout, and
 * returns its exit code and output. Never throws: a command killed by the
 * timeout (or a signal) has `exit_code: null`, and one that couldn't start
 * has exit code 127 with the error in `stderr`.
 *
 * @example
 * const { exit_code, stdout } = await runCommand({
 *     command: '/Users/me/.bun/bin/bun',
 *     args: ['/abs/luca-run.ts', '--unfinished'],
 *     cwd: '/Users/me',
 *     env: { PATH: '/usr/bin' },
 *     timeout_ms: 20_000,
 * })
 */
export const runCommand: RunCommand = ({
    command,
    args,
    cwd,
    env,
    timeout_ms,
}) =>
    new Promise((resolve) => {
        execFile(
            command,
            args,
            { cwd, env, timeout: timeout_ms, maxBuffer: 8 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (!error) {
                    resolve({ exit_code: 0, stdout, stderr })
                    return
                }
                if (error.killed || error.signal) {
                    resolve({ exit_code: null, stdout, stderr })
                    return
                }
                resolve({
                    exit_code:
                        typeof error.code === 'number'
                            ? error.code
                            : COULD_NOT_START,
                    stdout,
                    stderr: stderr === '' ? error.message : stderr,
                })
            }
        )
    })
