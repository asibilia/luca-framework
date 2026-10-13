import { execFile } from 'node:child_process'

import type { ListProcesses } from './board-server'

/** Room for a long process list: `ps -ww` never cuts a command line. */
const PS_MAX_BUFFER = 32 * 1024 * 1024

/**
 * Every running process's full command line, from `ps -axww -o command=`.
 * Rejects when `ps` fails, so the caller can do nothing rather than guess.
 *
 * @example
 * const lines = await listProcesses()
 * lines.some((line) => line.includes('--run-id luca-20260923-123042-ab12'))
 */
export const listProcesses: ListProcesses = () =>
    new Promise((resolve, reject) => {
        execFile(
            'ps',
            ['-axww', '-o', 'command='],
            { maxBuffer: PS_MAX_BUFFER },
            (error, stdout) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve(
                    stdout
                        .split('\n')
                        .map((line) => line.trim())
                        .filter((line) => line !== '')
                )
            }
        )
    })
