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
 * Every running process's full command line, from `ps -axww -o command=`
 * (`-ww` never cuts a line). Rejects when `ps` fails, so a caller can take
 * the safe side rather than guess.
 *
 * @example
 * const live = liveRunIds({ command_lines: await listProcesses() })
 */
export const listProcesses: ListProcesses = async () => {
    const child = Bun.spawn(['ps', '-axww', '-o', 'command='], {
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
