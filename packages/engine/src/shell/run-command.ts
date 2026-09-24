/** What a finished command left behind. */
export type CommandResult = {
    /** `null` when the command was killed. */
    exit_code: number | null
    stdout: string
    stderr: string
    timed_out: boolean
}

/** Commands the engine runs give up after this long unless told otherwise. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 300_000

/**
 * Runs a command and collects its output. Never throws on a non-zero exit;
 * a command that runs past `timeout_ms` is killed and marked `timed_out`.
 *
 * @example
 * const result = await runCommand({ cmd: ['git', 'status'], cwd })
 * if (result.exit_code !== 0) console.error(result.stderr)
 */
export const runCommand = async ({
    cmd,
    cwd,
    timeout_ms,
    env,
}: {
    cmd: string[]
    cwd: string
    /** Defaults to `DEFAULT_COMMAND_TIMEOUT_MS`. */
    timeout_ms?: number
    /** Variables set on top of the engine's own environment. */
    env?: Record<string, string>
}): Promise<CommandResult> => {
    const proc = Bun.spawn({
        cmd,
        cwd,
        env: env === undefined ? undefined : { ...process.env, ...env },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
    })
    let timedOut = false
    const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGKILL')
    }, timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS)
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ])
    clearTimeout(timer)
    return {
        exit_code: timedOut ? null : exitCode,
        stdout,
        stderr,
        timed_out: timedOut,
    }
}

/** Runs a command line from the engine config through `sh -c`. */
export const runShell = ({
    command,
    cwd,
    timeout_ms,
}: {
    command: string
    cwd: string
    timeout_ms?: number
}): Promise<CommandResult> =>
    runCommand({ cmd: ['sh', '-c', command], cwd, timeout_ms })

/** Keeps the start and end of long output, for the journal and prompts. */
export const clipOutput = ({
    text,
    max,
}: {
    text: string
    /** Defaults to 6000 characters. */
    max?: number
}): string => {
    const limit = max ?? 6000
    if (text.length <= limit) return text
    const half = Math.floor(limit / 2)
    return `${text.slice(0, half)}\n[...]\n${text.slice(-half)}`
}
