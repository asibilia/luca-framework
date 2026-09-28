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
 * After a timed-out command is killed, how long the engine still waits for
 * its output. A child that left the command's process group can hold the
 * output pipe open; past this, the engine stops reading and moves on.
 */
const PIPE_GRACE_MS = 2_000

/**
 * The process groups of commands still running. Each command runs in its
 * own group, so a Ctrl-C to the engine no longer reaches it by itself: the
 * engine passes signals on (see `stopCommandsOnExit`).
 */
const liveGroups = new Set<number>()

/** Sends `signal` to a command and everything it started. */
const signalGroup = ({
    pid,
    signal,
}: {
    pid: number
    signal: NodeJS.Signals
}): void => {
    try {
        process.kill(-pid, signal)
    } catch {
        // The group is gone already.
    }
}

/** Sends `signal` to every command still running. */
const signalLiveGroups = (signal: NodeJS.Signals): void => {
    for (const pid of liveGroups) signalGroup({ pid, signal })
}

let stopOnExitSet = false

/**
 * Once: when the engine exits, or a signal ends it, the commands it is
 * running end too, as they would if they shared its process group. A signal
 * is passed on, then raised again so the engine ends the way it would have.
 */
const stopCommandsOnExit = (): void => {
    if (stopOnExitSet) return
    stopOnExitSet = true
    process.on('exit', () => signalLiveGroups('SIGKILL'))
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        process.once(signal, () => {
            signalLiveGroups(signal)
            process.kill(process.pid, signal)
        })
    }
}

/**
 * Reads a whole output stream as text. `stop` ends the read early and keeps
 * what came so far.
 */
const collectText = (
    stream: ReadableStream<Uint8Array>
): { text: Promise<string>; stop: () => void } => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const read = async (): Promise<string> => {
        let text = ''
        try {
            for (;;) {
                const chunk = await reader.read()
                if (chunk.done) break
                text += decoder.decode(chunk.value, { stream: true })
            }
        } catch {
            // Stopped or broken: keep what came.
        }
        return text + decoder.decode()
    }
    return {
        text: read(),
        stop: () => {
            reader.cancel().catch(() => undefined)
        },
    }
}

/**
 * Runs a command and collects its output. Never throws on a non-zero exit.
 *
 * The command runs in its own process group. One that runs past
 * `timeout_ms` is killed with everything it started (the whole group) and
 * marked `timed_out`, with `exit_code: null`. The engine then waits at most
 * a moment more for its output, so a child that left the group can't hold
 * the engine.
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
    stopCommandsOnExit()
    const proc = Bun.spawn({
        cmd,
        cwd,
        env: env === undefined ? undefined : { ...process.env, ...env },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        // Its own process group, so a timeout can kill all it started.
        detached: true,
    })
    liveGroups.add(proc.pid)
    const stdout = collectText(proc.stdout)
    const stderr = collectText(proc.stderr)
    let timedOut = false
    let grace: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
        timedOut = true
        signalGroup({ pid: proc.pid, signal: 'SIGKILL' })
        proc.kill('SIGKILL')
        grace = setTimeout(() => {
            stdout.stop()
            stderr.stop()
        }, PIPE_GRACE_MS)
    }, timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS)
    const [out, err, exitCode] = await Promise.all([
        stdout.text,
        stderr.text,
        proc.exited,
    ])
    clearTimeout(timer)
    clearTimeout(grace)
    liveGroups.delete(proc.pid)
    return {
        exit_code: timedOut ? null : exitCode,
        stdout: out,
        stderr: err,
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
