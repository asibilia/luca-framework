/**
 * `luca models`: scores each routed role's model from the ticket review's
 * findings over this repo's runs, and prints the report (#605):
 *
 *   luca models
 *
 * It only reads: it never writes config or journals. A run is this repo's
 * when its `run_started` repo is the main checkout or git top folder of the
 * current folder. Exits 0, 2 on bad flags.
 */
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

import { defaultRunsDir, readRecords, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { formatModelReport, scoreModels } from '../models/model-score'

/** `luca models`'s usage line. */
export const MODELS_USAGE = 'Usage: luca models'

/** A path with its symlinks followed, or made absolute when it's gone. */
const realPath = (path: string): string => {
    try {
        return realpathSync(path)
    } catch {
        return resolve(path)
    }
}

/**
 * The repos a run started from `cwd` may name, real paths: the main
 * checkout (a worktree's too), then the git top folder. Outside git, `cwd`.
 */
const currentRepos = ({ cwd }: { cwd: string }): string[] => {
    const git = (...args: string[]) => {
        const out = Bun.spawnSync(['git', '-C', cwd, ...args])
        const said = out.stdout.toString().trim()
        return out.exitCode === 0 && said !== '' ? said : null
    }
    const top = git('rev-parse', '--show-toplevel')
    const common = git(
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir'
    )
    const main =
        common !== null && basename(common) === '.git' ? dirname(common) : null
    return [
        ...new Set(
            [main, top ?? cwd]
                .filter((repo) => repo !== null)
                .map((repo) => realPath(repo))
        ),
    ]
}

/**
 * The records of every run in `runs_dir` that started in one of `repos`,
 * oldest run id first. A journal that can't be read is left out, with a
 * line on `warn`.
 */
const repoRuns = ({
    runs_dir,
    repos,
    warn,
}: {
    runs_dir: string
    repos: string[]
    warn: (line: string) => void
}): JournalRecord[][] => {
    if (!existsSync(runs_dir)) return []
    const want = new Set(repos)
    return readdirSync(runs_dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => name)
        .toSorted()
        .flatMap((run_id) => {
            let records: JournalRecord[]
            try {
                records = readRecords({
                    file: runJournalPath({ runs_dir, run_id }),
                })
            } catch (error) {
                warn(
                    `Left out run ${run_id}: ${error instanceof Error ? error.message : String(error)}`
                )
                return []
            }
            const [first] = records
            return first?.kind === 'run_started' &&
                first.content.repo !== null &&
                want.has(realPath(first.content.repo))
                ? [records]
                : []
        })
}

/** Runs `luca models` with the flags after `models`; returns the exit code. */
export const modelsCommand = ({ argv }: { argv: string[] }): number => {
    if (argv.length > 0) {
        console.error(MODELS_USAGE)
        return 2
    }
    const runs_dir = defaultRunsDir()
    const repos = currentRepos({ cwd: process.cwd() })
    const runs = repoRuns({
        runs_dir,
        repos,
        warn: (line) => {
            console.error(`[luca models] ${line}`)
        },
    })
    if (runs.length === 0) {
        console.log(`No Luca runs of ${repos.join(' or ')} in ${runs_dir}.`)
        return 0
    }
    console.log(formatModelReport({ report: scoreModels({ runs }) }))
    return 0
}
