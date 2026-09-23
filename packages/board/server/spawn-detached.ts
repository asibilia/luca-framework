import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'

import type { SpawnEngine } from './board-server'

/**
 * Starts the engine as its own detached process group, with stdout and stderr
 * appended to `log_path`, and lets the plugin forget it (`unref`), so the
 * engine outlives the plugin, the chat, and Paseo. Returns at once; a failure
 * to start arrives later through `on_error`.
 *
 * @example
 * const { pid } = spawnDetached({
 *     command: '/Users/me/.bun/bin/bun',
 *     args: ['/abs/luca-run.ts', '--demo', ...],
 *     env: { ...process.env, LUCA_BOARD_TOKEN: token },
 *     cwd: '/Users/me/repo',
 *     log_path: '/tmp/luca-20260923-123042-ab12.log',
 *     on_error: (error) => console.error(error),
 * })
 */
export const spawnDetached: SpawnEngine = ({
    command,
    args,
    env,
    cwd,
    log_path,
    on_error,
}) => {
    const log = openSync(log_path, 'a', 0o600)
    try {
        const child = spawn(command, args, {
            cwd,
            env,
            detached: true,
            stdio: ['ignore', log, log],
        })
        // Without a listener, a failed start would crash the plugin process.
        child.on('error', on_error)
        child.unref()
        return { pid: child.pid ?? null }
    } finally {
        closeSync(log)
    }
}
