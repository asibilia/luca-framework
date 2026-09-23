import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { z } from 'zod'

/**
 * The runs this plugin started, kept in a JSON file so a plugin restart still
 * knows each run's token and chat. Board state itself stays in memory; the
 * engine's next send replays the journal to rebuild it.
 */

export const RunEntrySchema = z.object({
    run_id: z.string().min(1),
    /** The per-run secret the engine must send with every event. */
    token: z.string().min(1),
    /** The chat the run was started from; its rows go there. */
    agent_id: z.string().min(1),
    workspace_id: z.string().min(1),
    /** The repo the run builds in (the chat's working directory). */
    repo: z.string().min(1),
    /** The spec number, `null` for a demo run. */
    spec: z.number().int().positive().nullable(),
    demo: z.boolean(),
    started_at: z.string(),
    log_path: z.string(),
})

export type RunEntry = z.infer<typeof RunEntrySchema>

const RegistryFileSchema = z.object({
    version: z.literal(1),
    runs: z.array(RunEntrySchema),
})

/** How many runs the file keeps; the oldest are dropped first. */
const RUNS_KEPT = 50

/**
 * Where the registry lives: `$LUCA_BOARD_STATE_DIR/runs.json`, else
 * `~/.local/state/luca/board/runs.json`.
 */
export const defaultRegistryPath = ({
    env,
    home_dir,
}: {
    env: Record<string, string | undefined>
    home_dir: string
}): string =>
    join(
        env.LUCA_BOARD_STATE_DIR || join(home_dir, '.local/state/luca/board'),
        'runs.json'
    )

const readEntries = ({
    path,
    log,
}: {
    path: string
    log: (message: string) => void
}): RunEntry[] => {
    let text: string
    try {
        text = readFileSync(path, 'utf8')
    } catch {
        return []
    }
    try {
        const parsed = RegistryFileSchema.safeParse(JSON.parse(text))
        if (parsed.success) return parsed.data.runs
        log(`The run registry ${path} is not valid, starting empty: ${z.prettifyError(parsed.error)}`)
    } catch (error) {
        log(`The run registry ${path} is not JSON, starting empty: ${String(error)}`)
    }
    return []
}

/**
 * Opens the run registry at `path`: reads it now, and writes it on each add.
 * A missing or broken file starts empty (and is logged); a failed write is
 * logged and the run still works until the plugin restarts.
 *
 * @example
 * const registry = createRunRegistry({ path, log: console.error })
 * registry.add({ entry })
 * registry.get({ run_id })?.token
 */
export const createRunRegistry = ({
    path,
    log,
}: {
    path: string
    log: (message: string) => void
}) => {
    let entries = readEntries({ path, log })

    const write = () => {
        try {
            mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
            const temp = `${path}.${process.pid}.tmp`
            writeFileSync(
                temp,
                `${JSON.stringify({ version: 1, runs: entries }, null, 2)}\n`,
                { mode: 0o600 }
            )
            renameSync(temp, path)
        } catch (error) {
            log(`Couldn't write the run registry ${path}: ${String(error)}`)
        }
    }

    return {
        add: ({ entry }: { entry: RunEntry }) => {
            entries = [
                ...entries.filter((known) => known.run_id !== entry.run_id),
                entry,
            ].slice(-RUNS_KEPT)
            write()
        },
        remove: ({ run_id }: { run_id: string }) => {
            entries = entries.filter((known) => known.run_id !== run_id)
            write()
        },
        get: ({ run_id }: { run_id: string }): RunEntry | null =>
            entries.find((known) => known.run_id === run_id) ?? null,
        /** Every run, oldest first. */
        list: (): RunEntry[] => entries,
    }
}

export type RunRegistry = ReturnType<typeof createRunRegistry>
