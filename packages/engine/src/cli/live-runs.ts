/**
 * Which runs have a live engine process, from `ps`. The board plugin checks
 * the same way (`liveRunIds` and `listProcesses` in
 * `packages/board/server/`). The plugin never imports the engine and the
 * engine never imports the plugin, so this is a copy: change both together.
 */

/** Every running process's full command line. Rejects when it can't list them. */
export type ListProcesses = () => Promise<string[]>

/**
 * How many times the board plugin restarts one run by itself before it gives
 * up. A copy of the board's `MAX_AUTO_RESTARTS`: change both together.
 */
export const BOARD_MAX_AUTO_RESTARTS = 3

/**
 * The run ids that have a live engine, from every process's command line: a
 * run is live when a command line has `--run-id <id>` or `--resume <id>` (or
 * `--run-id=<id>`), as whole words, so one id never matches inside another.
 * Pure.
 *
 * @example
 * liveRunIds({ command_lines: ['bun luca-run.ts --resume r1 --repo /x'] }) // Set { 'r1' }
 */
export const liveRunIds = ({
    command_lines,
}: {
    command_lines: string[]
}): Set<string> => {
    const live = new Set<string>()
    for (const line of command_lines) {
        const tokens = line.split(/\s+/)
        tokens.forEach((token, index) => {
            const next = tokens[index + 1]
            if ((token === '--run-id' || token === '--resume') && next) {
                live.add(next)
            }
            const joined = /^--(?:run-id|resume)=(.+)$/.exec(token)
            if (joined?.[1]) live.add(joined[1])
        })
    }
    return live
}

/**
 * The first live engine on `run_id` (#701): a process whose command line
 * names the run with `--run-id` or `--resume`, other than `own_pids` (the
 * checking process and its parents). `process_lines` are `ps` lines of a pid
 * then a command line. Pure.
 *
 * @example
 * findLiveEngine({ run_id: 'r1', process_lines: ['75023 bun luca-run.ts --resume r1'], own_pids: [80000] }) // { pid: 75023 }
 */
export const findLiveEngine = ({
    run_id,
    process_lines,
    own_pids,
}: {
    run_id: string
    process_lines: string[]
    own_pids: number[]
}): { pid: number } | null => {
    for (const line of process_lines) {
        const match = /^\s*(\d+)\s+(.*)$/.exec(line)
        if (!match?.[1] || match[2] === undefined) continue
        const pid = Number(match[1])
        if (own_pids.includes(pid)) continue
        if (liveRunIds({ command_lines: [match[2]] }).has(run_id)) {
            return { pid }
        }
    }
    return null
}

/**
 * Why `luca-run --resume <run_id>` must not start (#701): another live engine
 * on the run, or a process list it can't read; `null` when it may start.
 * Leaves out this process and its parent.
 */
export const resumeRefusal = async ({
    run_id,
    list_processes = () => listProcesses({ with_pids: true }),
}: {
    run_id: string
    list_processes?: ListProcesses
}): Promise<string | null> => {
    const process_lines = await list_processes().catch(() => null)
    if (process_lines === null) {
        return `[luca-run] Couldn't check for a live engine on run ${run_id}. Not starting.`
    }
    const found = findLiveEngine({
        run_id,
        process_lines,
        own_pids: [process.pid, process.ppid],
    })
    return found === null
        ? null
        : `[luca-run] Run ${run_id} already has a live engine (pid ${found.pid}). Not starting a second one.`
}

/**
 * Every running process's full command line, from `ps -axww -o command=`
 * (`-ww` never cuts a line), each after its pid with `with_pids`. Rejects
 * when `ps` fails, so a caller can take the safe side rather than guess.
 *
 * @example
 * const live = liveRunIds({ command_lines: await listProcesses() })
 */
export const listProcesses = async ({
    with_pids = false,
}: { with_pids?: boolean } = {}): Promise<string[]> => {
    const format = with_pids ? 'pid=,command=' : 'command='
    const child = Bun.spawn(['ps', '-axww', '-o', format], {
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [stdout, stderr, exit_code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ])
    if (exit_code !== 0) {
        throw new Error(
            `ps exited with ${exit_code}: ${stderr.trim().slice(0, 300)}`
        )
    }
    return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
}
