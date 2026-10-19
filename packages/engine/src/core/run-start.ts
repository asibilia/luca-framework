/**
 * A run's first records: `run_started`, and on a resume `engine_resumed`
 * and what came of taking the repo's config again.
 */
import values from 'lodash/values'

import { configChanges } from '../config/config-reload'
import type {
    EngineConfig,
    LoadEngineConfigResult,
} from '../config/engine-config'
import { lucaVersion } from '../config/luca-version'
import { configProblems } from '../intake/intake-checks'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'

/**
 * Starts a run by writing its first record. The spec and config it names are
 * what every later step of the run works from; the Luca version it names is
 * the one the run started on.
 */
export const startRun = ({
    journal,
    spec_number,
    config,
    base_branch,
    memory,
    repo,
    luca_version = lucaVersion(),
}: {
    journal: Journal
    spec_number: number
    config: EngineConfig
    /** The branch the run branch starts from. Defaults to `main`. */
    base_branch?: string
    /**
     * Turns memory on (#370), with the project's vault (`null` searches only
     * `default`). Leave it out for a run without memory.
     */
    memory?: { project_vault: string | null }
    /** The repo the run is on, so a resume can find it. Defaults to `null`. */
    repo?: string | null
    /** Luca's version. Defaults to the engine's own. */
    luca_version?: string
}): JournalRecord =>
    journal.append({
        kind: 'run_started',
        ticket: null,
        role: null,
        content: {
            spec_number,
            config,
            base_branch,
            memory: memory ?? null,
            repo,
            luca_version,
        },
    })

/**
 * Records that the engine started again on a run's journal, on Luca's
 * version `luca_version`, before its first step.
 */
export const recordResume = ({
    journal,
    luca_version = lucaVersion(),
}: {
    journal: Journal
    /** Luca's version. Defaults to the engine's own. */
    luca_version?: string
}): JournalRecord =>
    journal.append({
        kind: 'engine_resumed',
        ticket: null,
        role: null,
        content: { luca_version },
    })

/**
 * On a resume, takes the repo's config again (#516), just read as
 * `loaded`, and journals what came of it, right after `recordResume`:
 *
 * - a `config_reloaded` with the build fields (`RELOADED_FIELDS`) that
 *   changed, old to new, which replay puts on the run's config;
 * - nothing, when none changed (frozen fields never count, see
 *   `FROZEN_FIELDS`);
 * - a `config_reload_refused` with the reason, when the file is missing,
 *   not JSON, not a valid config, or one intake would refuse
 *   (`configProblems`, on the run's tickets). The run keeps its config.
 *
 * Never throws for a bad file: the run always goes on. Returns the record
 * it appended, or `null`. A journal with no config yet (not a run) gets
 * nothing; the decision step says what is wrong with it.
 *
 * @example
 * recordResume({ journal })
 * const reload = recordConfigReload({ journal, loaded: await loadEngineConfig({ repo_root }) })
 */
export const recordConfigReload = ({
    journal,
    loaded,
}: {
    journal: Journal
    loaded: LoadEngineConfigResult
}): JournalRecord | null => {
    const state = replayRun({ records: journal.read() })
    if (state.config === null) return null
    const refuse = (reason: string): JournalRecord =>
        journal.append({
            kind: 'config_reload_refused',
            ticket: null,
            role: null,
            content: { reason },
        })
    if (!loaded.ok) return refuse(loaded.error)
    const problems = configProblems({
        config: loaded.config,
        tickets: values(state.snapshot?.tickets ?? {}),
    })
    if (problems.length > 0) return refuse(problems.join('\n'))
    const changes = configChanges({
        current: state.config,
        next: loaded.config,
    })
    return changes.length === 0
        ? null
        : journal.append({
              kind: 'config_reloaded',
              ticket: null,
              role: null,
              content: { changes },
          })
}
