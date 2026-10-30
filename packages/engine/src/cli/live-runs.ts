/**
 * Which runs have a live engine process, from `ps`. The board plugin checks
 * the same way (`liveRunIds` and `listProcesses` in
 * `packages/board/server/`). The plugin never imports the engine and the
 * engine never imports the plugin, so this is a copy: change both together.
 */

/** Every running process's full command line. Rejects when it can't list them. */
export type ListProcesses = () => Promise<string[]>

/** One running process, from `ps`: its pid, its parent's, its command line. */
export type ProcessRow = { pid: number; ppid: number; command: string }

/** Every running process as a `ProcessRow`. Rejects when it can't list them. */
export type ListProcessRows = () => Promise<ProcessRow[]>

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
 * checking process and its parents). Pure.
 *
 * @example
 * findLiveEngine({ run_id: 'r1', processes: [{ pid: 75023, ppid: 1, command: 'bun luca-run.ts --resume r1' }], own_pids: [80000] }) // { pid: 75023 }
 */
export const findLiveEngine = ({
    run_id,
    processes,
    own_pids,
}: {
    run_id: string
    processes: ProcessRow[]
    own_pids: number[]
}): { pid: number } | null => {
    const found = processes.find(
        ({ pid, command }) =>
            !own_pids.includes(pid) &&
            liveRunIds({ command_lines: [command] }).has(run_id)
    )
    return found === undefined ? null : { pid: found.pid }
}

/**
 * `pid` and every parent above it, from `processes`. A shell or wrapper
 * (`zsh -c`, `timeout`, `caffeinate`) that started this engine names the
 * run too, at any depth. Pure.
 *
 * @example
 * ancestorPids({ pid: 3, processes: [{ pid: 3, ppid: 2, command: 'bun luca-run.ts' }, { pid: 2, ppid: 1, command: 'zsh -c luca-run' }] }) // [3, 2, 1]
 */
export const ancestorPids = ({
    pid,
    processes,
}: {
    pid: number
    processes: ProcessRow[]
}): number[] => {
    const parents = new Map(
        processes.map(({ pid: child, ppid }): [number, number] => [child, ppid])
    )
    const pids = [pid]
    let parent = parents.get(pid)
    while (parent !== undefined && parent > 0 && !pids.includes(parent)) {
        pids.push(parent)
        parent = parents.get(parent)
    }
    return pids
}

/**
 * Why `luca-run --resume <run_id>` must not start (#701): another live engine
 * on the run, or a process list it can't read; `null` when it may start.
 * Leaves out this process (`own_pid`) and all its parents (from
 * `parent_pid` up); both default to the real process's.
 */
export const resumeRefusal = async ({
    run_id,
    list_process_rows = listProcessRows,
    own_pid = process.pid,
    parent_pid = process.ppid,
}: {
    run_id: string
    list_process_rows?: ListProcessRows
    own_pid?: number
    parent_pid?: number
}): Promise<string | null> => {
    const processes = await list_process_rows().catch(() => null)
    if (processes === null) {
        return `[luca-run] Couldn't check for a live engine on run ${run_id}. Not starting.`
    }
    const found = findLiveEngine({
        run_id,
        processes,
        own_pids: [own_pid, parent_pid].flatMap((pid) =>
            ancestorPids({ pid, processes })
        ),
    })
    return found === null
        ? null
        : `[luca-run] Run ${run_id} already has a live engine (pid ${found.pid}). Not starting a second one.`
}

/**
 * The lines of `ps -axww -o <format>` (`-ww` never cuts one). Rejects when
 * `ps` fails.
 */
const runPs = async ({ format }: { format: string }): Promise<string[]> => {
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

/**
 * Every running process's full command line, from `ps -axww -o command=`.
 * Rejects when `ps` fails, so a caller can take the safe side rather than
 * guess.
 *
 * @example
 * const live = liveRunIds({ command_lines: await listProcesses() })
 */
export const listProcesses: ListProcesses = () => runPs({ format: 'command=' })

/**
 * Every running process with its pid and its parent's pid, from
 * `ps -axww -o pid=,ppid=,command=`. Rejects when `ps` fails.
 *
 * @example
 * const own = ancestorPids({ pid: process.pid, processes: await listProcessRows() })
 */
export const listProcessRows: ListProcessRows = async () => {
    const lines = await runPs({ format: 'pid=,ppid=,command=' })
    return lines.flatMap((line) => {
        const [, pid, ppid, command] = /^(\d+)\s+(\d+)\s+(.*)$/.exec(line) ?? []
        return pid && ppid && command !== undefined
            ? [{ pid: Number(pid), ppid: Number(ppid), command }]
            : []
    })
}
