/** A process the command started that still ran after a timeout's kill. */
export type Survivor = {
    pid: number
    /** Its command line, from `ps`. */
    command: string
}

/** What a finished command left behind. */
export type CommandResult = {
    /** `null` when the command was killed. */
    exit_code: number | null
    stdout: string
    stderr: string
    timed_out: boolean
    /** Set on a timeout only: what still ran after the kill (#571). */
    survivors?: Survivor[]
}

/** Commands the engine runs give up after this long unless told otherwise. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 300_000

/**
 * After a timed-out command is killed, how long the engine still waits for
 * its output when the caller doesn't say (`pipe_grace_ms`). A child that left
 * the command's process group can hold the output pipe open; past this, the
 * engine stops reading and moves on.
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

/** One line of `ps`: a process, its parent, and its process group. */
type ProcessEntry = Survivor & { ppid: number; pgid: number }

/**
 * Every process now running, from `ps`. Empty when `ps` fails: then the
 * engine can only kill the command's own group.
 */
const listProcessTable = async (): Promise<ProcessEntry[]> => {
    try {
        const ps = Bun.spawn(
            ['ps', '-axww', '-o', 'pid=,ppid=,pgid=,command='],
            {
                stdin: 'ignore',
                stdout: 'pipe',
                stderr: 'ignore',
            }
        )
        const [text, code] = await Promise.all([
            new Response(ps.stdout).text(),
            ps.exited,
        ])
        if (code !== 0) return []
        return text.split('\n').flatMap((line) => {
            const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s(.*)$/.exec(line)
            if (match === null) return []
            const [, pid, ppid, pgid, command] = match
            return [
                {
                    pid: Number(pid),
                    ppid: Number(ppid),
                    pgid: Number(pgid),
                    command: (command ?? '').trim(),
                },
            ]
        })
    } catch {
        return []
    }
}

/** Every process below `pid`, found by parent process id. */
const descendantsOf = async (pid: number): Promise<ProcessEntry[]> => {
    const table = await listProcessTable()
    const found: ProcessEntry[] = []
    const parents = new Set([pid])
    for (let grew = true; grew; ) {
        grew = false
        for (const entry of table) {
            if (!parents.has(entry.ppid) || parents.has(entry.pid)) continue
            parents.add(entry.pid)
            found.push(entry)
            grew = true
        }
    }
    return found
}

/** Whether a process with this id still runs. */
const isRunning = (pid: number): boolean => {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

/** How long the engine waits for killed processes to go before naming them. */
const SURVIVOR_WAIT_MS = 500

/** Of `processes`, those still running after up to `SURVIVOR_WAIT_MS`. */
const survivorsOf = async (processes: ProcessEntry[]): Promise<Survivor[]> => {
    const end = Date.now() + SURVIVOR_WAIT_MS
    let alive = processes.filter(({ pid }) => isRunning(pid))
    while (alive.length > 0 && Date.now() < end) {
        await Bun.sleep(25)
        alive = alive.filter(({ pid }) => isRunning(pid))
    }
    return alive.map(({ pid, command }) => ({ pid, command }))
}

/**
 * Kills a timed-out command and everything it started (#571). It first walks
 * the process tree from the command, while the tree is still whole, then
 * kills the command's group and the group of every process below it, so a
 * child that started a group of its own goes too. Returns what it found.
 */
const killTree = async (pid: number): Promise<ProcessEntry[]> => {
    const descendants = await descendantsOf(pid)
    signalGroup({ pid, signal: 'SIGKILL' })
    for (const entry of descendants) {
        // Never the engine's own group.
        if (entry.pgid > 1 && entry.pgid !== process.pid) {
            signalGroup({ pid: entry.pgid, signal: 'SIGKILL' })
        }
        try {
            process.kill(entry.pid, 'SIGKILL')
        } catch {
            // Gone already.
        }
    }
    return descendants
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
 * `timeout_ms` is killed with everything it started (its group, and the
 * group of every process below it) and marked `timed_out`, with
 * `exit_code: null` and the `survivors` the kill missed. The engine then
 * waits at most a moment more for its output (`pipe_grace_ms`, default
 * `PIPE_GRACE_MS`), so a child that escaped the kill can't hold the engine.
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
    pipe_grace_ms,
}: {
    cmd: string[]
    cwd: string
    /** Defaults to `DEFAULT_COMMAND_TIMEOUT_MS`. */
    timeout_ms?: number
    /** Variables set on top of the engine's own environment. */
    env?: Record<string, string>
    /**
     * How long to keep reading output after a timeout kill; defaults to
     * `PIPE_GRACE_MS`. Tests of that wait pass a short one (#580).
     */
    pipe_grace_ms?: number
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
    let killed: Promise<ProcessEntry[]> | undefined
    let grace: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
        killed = killTree(proc.pid).then((descendants) => {
            proc.kill('SIGKILL')
            grace = setTimeout(() => {
                stdout.stop()
                stderr.stop()
            }, pipe_grace_ms ?? PIPE_GRACE_MS)
            return descendants
        })
    }, timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS)
    const [out, err, exitCode] = await Promise.all([
        stdout.text,
        stderr.text,
        proc.exited,
    ])
    clearTimeout(timer)
    const descendants = await killed
    clearTimeout(grace)
    liveGroups.delete(proc.pid)
    const result = {
        exit_code: killed === undefined ? exitCode : null,
        stdout: out,
        stderr: err,
        timed_out: killed !== undefined,
    }
    return descendants === undefined
        ? result
        : { ...result, survivors: await survivorsOf(descendants) }
}

/** Runs a command line from the engine config through `sh -c`. */
export const runShell = ({
    command,
    cwd,
    timeout_ms,
    pipe_grace_ms,
}: {
    command: string
    cwd: string
    timeout_ms?: number
    /** See `runCommand`. */
    pipe_grace_ms?: number
}): Promise<CommandResult> =>
    runCommand({
        cmd: ['sh', '-c', command],
        cwd,
        timeout_ms,
        pipe_grace_ms,
    })

/** A time limit in words: `30 minutes`, `1 minute`, `0.3 seconds`. */
export const durationText = (ms: number): string => {
    const [amount, unit] =
        ms >= 60_000 ? [ms / 60_000, 'minute'] : [ms / 1000, 'second']
    const rounded = Math.round(amount * 10) / 10
    return `${rounded} ${unit}${rounded === 1 ? '' : 's'}`
}

/**
 * The line a timed-out command's output starts with: how long it had, that
 * the engine stopped it, then `hint`, if any. With `survivors`, it names
 * each one instead of claiming everything was stopped (#571).
 *
 * @example
 * timedOutLine({ timeout_ms: 300_000, hint: 'To give it longer, raise `test_timeout_ms`.' })
 * // 'Timed out after 5 minutes, so the engine stopped it and everything it started. To give it longer, raise `test_timeout_ms`.\n'
 */
export const timedOutLine = ({
    timeout_ms,
    hint,
    survivors,
}: {
    timeout_ms: number
    /** How to give the command longer. */
    hint?: string
    /** What still ran after the kill. */
    survivors?: Survivor[]
}): string => {
    const stopped =
        survivors === undefined || survivors.length === 0
            ? 'so the engine stopped it and everything it started.'
            : `so the engine stopped it. These were still running after the kill: ${survivors.map(({ pid, command }) => `pid ${pid} (${command})`).join(', ')}.`
    return `Timed out after ${durationText(timeout_ms)}, ${stopped}${hint === undefined ? '' : ` ${hint}`}\n`
}

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
