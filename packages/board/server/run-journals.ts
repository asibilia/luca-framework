import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { EngineRecordSchema, type EngineRecord } from '../shared/board-rpc'

/**
 * The runs folder the engine writes: `<runs_dir>/<run_id>/journal.jsonl`, one
 * JSON record per line, only ever appended to. The board reads it to rebuild
 * runs after a reload and to show runs it didn't start. It never writes it.
 */

/** The file name of a run's journal inside its run folder, as the engine names it. */
const JOURNAL_FILE = 'journal.jsonl'

/**
 * Where the engine keeps its runs: `$LUCA_RUNS_DIR`, else
 * `~/.local/state/luca/runs` (the engine's own default).
 */
export const defaultRunsDir = ({
    env,
    home_dir,
}: {
    env: Record<string, string | undefined>
    home_dir: string
}): string => env.LUCA_RUNS_DIR || join(home_dir, '.local/state/luca/runs')

/** The journal file of one run. */
export const journalPath = ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): string => join(runs_dir, run_id, JOURNAL_FILE)

/** One journal in the runs folder, with its size and change time. */
export type JournalFile = {
    run_id: string
    size: number
    changed_ms: number
}

/**
 * Every run folder with a journal, newest change first. A missing runs
 * folder has none.
 *
 * @example
 * const journals = await listJournals({ runs_dir })
 */
export const listJournals = async ({
    runs_dir,
}: {
    runs_dir: string
}): Promise<JournalFile[]> => {
    let names: string[]
    try {
        names = await readdir(runs_dir)
    } catch {
        return []
    }
    const found = await Promise.all(
        names.map(async (run_id): Promise<JournalFile | null> => {
            try {
                const info = await stat(journalPath({ runs_dir, run_id }))
                return info.isFile()
                    ? { run_id, size: info.size, changed_ms: info.mtimeMs }
                    : null
            } catch {
                return null
            }
        })
    )
    return found
        .filter((journal) => journal !== null)
        .toSorted((left, right) => right.changed_ms - left.changed_ms)
}

/**
 * A run's journal records, oldest first. A line that isn't a record (such
 * as a half-written last line) is skipped and logged; a missing file has
 * no records.
 *
 * @example
 * const records = await readJournal({ runs_dir, run_id, log })
 */
export const readJournal = async ({
    runs_dir,
    run_id,
    log,
}: {
    runs_dir: string
    run_id: string
    log: (message: string) => void
}): Promise<EngineRecord[]> => {
    let text: string
    try {
        text = await readFile(journalPath({ runs_dir, run_id }), 'utf8')
    } catch {
        return []
    }
    const records: EngineRecord[] = []
    for (const [index, line] of text.split('\n').entries()) {
        if (line.trim() === '') continue
        let parsed: ReturnType<typeof EngineRecordSchema.safeParse>
        try {
            parsed = EngineRecordSchema.safeParse(JSON.parse(line))
        } catch {
            log(`[${run_id}] journal line ${index + 1} is not JSON, skipped.`)
            continue
        }
        if (!parsed.success) {
            log(
                `[${run_id}] journal line ${index + 1} is not a record, skipped.`
            )
            continue
        }
        records.push(parsed.data)
    }
    return records
}
