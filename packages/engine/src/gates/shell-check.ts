/**
 * Runs one shell command as a named gate check (`shellCheck`), and the small
 * clock the checks share (`msSince`). The install, prepare, types, lint, and
 * `pass_fail` test checks all run through it.
 */
import type { GateCheck, GateName } from './gate-schemas'

import {
    clipOutput,
    DEFAULT_COMMAND_TIMEOUT_MS,
    runShell,
    timedOutLine,
} from '../shell/run-command'

/** Milliseconds since `started` (from `performance.now()`), whole (#518). */
export const msSince = (started: number): number =>
    Math.round(performance.now() - started)

/**
 * Runs one shell command as a named check: `ok` on exit 0, with the clipped
 * output only when it failed. One that runs past `timeout_ms` is stopped,
 * with everything it started, and its output starts by saying so, then
 * `timeout_hint`, if any. The check says how long the command ran (#518).
 *
 * @example
 * const install = await shellCheck({ name: 'install', command: 'bun install', cwd })
 */
export const shellCheck = async ({
    name,
    command,
    cwd,
    timeout_ms,
    timeout_hint,
}: {
    name: GateName
    command: string
    cwd: string
    /** Defaults to `DEFAULT_COMMAND_TIMEOUT_MS`. */
    timeout_ms?: number
    /** How to give the command longer, for the timed-out message. */
    timeout_hint?: string
}): Promise<GateCheck> => {
    const limit = timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS
    const started = performance.now()
    const result = await runShell({ command, cwd, timeout_ms: limit })
    const ok = result.exit_code === 0
    const timedOut = result.timed_out
        ? timedOutLine({ timeout_ms: limit, hint: timeout_hint })
        : ''
    return {
        name,
        command,
        ok,
        exit_code: result.exit_code,
        output: ok
            ? ''
            : `${timedOut}${clipOutput({ text: `${result.stdout}\n${result.stderr}` })}`,
        duration_ms: msSince(started),
    }
}
