import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { readRunStart, unfinishedRuns } from './run-modes'

import { boardStateDir } from '../board/board-state-dir'
import { decide } from '../core/decide'
import { STOP_ACTIONS } from '../core/execute'
import { createJournal, runJournalPath } from '../journal/journal'

/**
 * The runs that are going, for the commands that must not change Luca under
 * them (`luca upgrade`, `luca-release`).
 */

/**
 * The board's run registry: `runs.json` in the board's state folder (see
 * `boardStateDir`), as the board plugin keeps it.
 */
export const defaultRegistryPath = ({
    env,
    home_dir,
}: {
    env: Record<string, string | undefined>
    home_dir: string
}): string => join(boardStateDir({ env, home_dir }), 'runs.json')

/** A run that is not over, by spec and repo. */
export type GoingRun = {
    run_id: string
    /** `null` for a demo run. */
    spec: number | null
    /** `null` in journals from before the repo was kept. */
    repo: string | null
}

const RegistrySchema = z.object({
    runs: z.array(
        z.object({
            run_id: z.string(),
            repo: z.string(),
            spec: z.number().nullable(),
            ended: z.unknown().nullable().default(null),
        })
    ),
})

/** Whether run `run_id` has a journal in `runs_dir` whose run is over. */
const journalIsOver = ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): boolean => {
    const file = runJournalPath({ runs_dir, run_id })
    if (!existsSync(file)) return false
    try {
        const records = createJournal({ file }).read()
        return records.length > 0 && STOP_ACTIONS.has(decide({ records }).type)
    } catch {
        return false
    }
}

/**
 * The runs that are going: every journal in `runs_dir` whose run is not
 * over (limit waits and stuck runs waiting for a reply included), and every
 * run in the board registry at `registry_path` that has not ended and whose
 * journal, if any, is not over. An error when the registry can't be read.
 *
 * @example
 * const going = await goingRuns({ runs_dir: defaultRunsDir(), registry_path })
 * if (going.ok) console.log(going.runs.map(({ spec }) => spec))
 */
export const goingRuns = async ({
    runs_dir,
    registry_path,
}: {
    runs_dir: string
    registry_path: string
}): Promise<{ ok: true; runs: GoingRun[] } | { ok: false; error: string }> => {
    const runs: GoingRun[] = unfinishedRuns({ runs_dir }).map((run_id) => {
        const start = readRunStart({ runs_dir, run_id })
        return start.ok
            ? {
                  run_id,
                  spec: start.start.spec_number,
                  repo: start.start.repo,
              }
            : { run_id, spec: null, repo: null }
    })
    const file = Bun.file(registry_path)
    if (!(await file.exists())) return { ok: true, runs }
    let parsed
    try {
        parsed = RegistrySchema.safeParse(JSON.parse(await file.text()))
    } catch (error) {
        return {
            ok: false,
            error: `The board's run registry ${registry_path} is not JSON: ${String(error)}`,
        }
    }
    if (!parsed.success) {
        return {
            ok: false,
            error: `The board's run registry ${registry_path} is not valid: ${z.prettifyError(parsed.error)}`,
        }
    }
    const known = new Set(runs.map(({ run_id }) => run_id))
    for (const entry of parsed.data.runs) {
        if (entry.ended !== null || known.has(entry.run_id)) continue
        if (journalIsOver({ runs_dir, run_id: entry.run_id })) continue
        known.add(entry.run_id)
        runs.push({ run_id: entry.run_id, spec: entry.spec, repo: entry.repo })
    }
    return { ok: true, runs }
}

/**
 * One going run as a list line. Pure.
 *
 * @example
 * describeRun({ run_id: 'r1', spec: 5, repo: '/code/app' })
 * // '- spec #5 in /code/app (run r1)'
 */
export const describeRun = ({ run_id, spec, repo }: GoingRun): string =>
    `- ${spec === null ? 'a demo' : `spec #${spec}`} in ${repo ?? 'an unknown repo'} (run ${run_id})`
