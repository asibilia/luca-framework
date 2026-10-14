import isEqual from 'lodash/isEqual'
import omit from 'lodash/omit'
import reduce from 'lodash/reduce'
import { z } from 'zod'

import type { EngineConfig } from './engine-config'

/**
 * The config fields a resumed run takes from the repo's
 * `.luca/config.json` again (#516). They say how the engine builds a
 * checkout before its tests, how long a test may run, or which new docs
 * may be committed, not what the tests are, so a run can change them
 * halfway without making its earlier results wrong: a repo that swaps a
 * slow `prepare` for a fast cached one gets it on the next resume.
 *
 * - `prepare`: the command run before each test run in a checkout.
 * - `prepare_timeout_ms`: how long that command may run.
 * - `prepare_concurrency`: how many prepare runs may go at once. The
 *   prepare slots take the limit on each call (`prepareCheck`), so a new
 *   one counts from the next prepare run.
 * - `test_timeout_ms`: how long each test command may run (#542). Each run
 *   of a test command reads it then, so a new one counts from the next.
 * - `leftover_allow`: more new markdown the leftover scan lets through
 *   (#520). Each scan reads it then, so a run stuck on a leftover can be
 *   unstuck by allowing the file and resuming.
 */
export const RELOADED_FIELDS = [
    'prepare',
    'prepare_timeout_ms',
    'prepare_concurrency',
    'test_timeout_ms',
    'leftover_allow',
] as const

/**
 * The config fields a run keeps from its `run_started`, whatever the file
 * says on a resume:
 *
 * - `checks`: the baseline, the red check, and the gates compare test
 *   results across the run. A ticket takes another's baseline by commit
 *   alone (`sharedBaselineStep` in `core/decide-build.ts`), and the red
 *   check holds every old passing test of the baseline to the new run by
 *   file and name (`checkRed` in `gates/red-check.ts`). A baseline taken
 *   with old commands is not comparable with a run of new ones. Intake also
 *   judged the run's tickets against these commands (a `bun` test command
 *   for the red check).
 * - `test_file_patterns`: which files are tests decides the red check, the
 *   role rules, and which commits were the test-writer's.
 * - `test_setup_files`: part of what the tests are, as `checks` is.
 * - `rule_files`: the rules lens judges against them; tickets already
 *   reviewed were judged on the old ones.
 * - `muninn`: the run's memory vault is fixed at start (`run_started.memory`).
 * - `run_budget_tokens`: the budget the run's tokens are counted against,
 *   and the board's, from `run_started`; a raise is a `retry` reply.
 * - `decision_model`: the model shadow mode asks (#534), so a run's asks
 *   are all of one model and can be scored together.
 */
export const FROZEN_FIELDS = [
    'checks',
    'test_file_patterns',
    'test_setup_files',
    'rule_files',
    'muninn',
    'run_budget_tokens',
    'decision_model',
] as const

const positiveInt = z.number().int().positive().nullable()
const patterns = z.array(z.string().min(1)).nullable()

/**
 * One reloaded field that changed: its value in the run before (`from`)
 * and in the file now (`to`). `null` is a field left out, so a field added
 * or removed is a change too.
 */
export const ConfigChangeSchema = z.discriminatedUnion('field', [
    z.object({
        field: z.literal('prepare'),
        from: z.string().min(1).nullable(),
        to: z.string().min(1).nullable(),
    }),
    z.object({
        field: z.literal('prepare_timeout_ms'),
        from: positiveInt,
        to: positiveInt,
    }),
    z.object({
        field: z.literal('prepare_concurrency'),
        from: positiveInt,
        to: positiveInt,
    }),
    z.object({
        field: z.literal('test_timeout_ms'),
        from: positiveInt,
        to: positiveInt,
    }),
    z.object({
        field: z.literal('leftover_allow'),
        from: patterns,
        to: patterns,
    }),
])

export type ConfigChange = z.infer<typeof ConfigChangeSchema>

/**
 * The reloaded fields whose value differs between the run's config
 * (`current`) and the one just read (`next`), old to new, in
 * `RELOADED_FIELDS` order. Frozen fields are never changes. Pure.
 *
 * @example
 * configChanges({ current: { ...config, prepare: 'make' }, next: { ...config, prepare: 'make fast' } })
 * // [{ field: 'prepare', from: 'make', to: 'make fast' }]
 */
export const configChanges = ({
    current,
    next,
}: {
    current: EngineConfig
    next: EngineConfig
}): ConfigChange[] => {
    const all: ConfigChange[] = [
        {
            field: 'prepare',
            from: current.prepare ?? null,
            to: next.prepare ?? null,
        },
        {
            field: 'prepare_timeout_ms',
            from: current.prepare_timeout_ms ?? null,
            to: next.prepare_timeout_ms ?? null,
        },
        {
            field: 'prepare_concurrency',
            from: current.prepare_concurrency ?? null,
            to: next.prepare_concurrency ?? null,
        },
        {
            field: 'test_timeout_ms',
            from: current.test_timeout_ms ?? null,
            to: next.test_timeout_ms ?? null,
        },
        {
            field: 'leftover_allow',
            from: current.leftover_allow ?? null,
            to: next.leftover_allow ?? null,
        },
    ]
    return all.filter(({ from, to }) => !isEqual(from, to))
}

const applyChange = ({
    config,
    change,
}: {
    config: EngineConfig
    change: ConfigChange
}): EngineConfig => {
    switch (change.field) {
        case 'prepare':
            return change.to === null
                ? omit(config, 'prepare')
                : { ...config, prepare: change.to }
        case 'prepare_timeout_ms':
            return change.to === null
                ? omit(config, 'prepare_timeout_ms')
                : { ...config, prepare_timeout_ms: change.to }
        case 'prepare_concurrency':
            return change.to === null
                ? omit(config, 'prepare_concurrency')
                : { ...config, prepare_concurrency: change.to }
        case 'test_timeout_ms':
            return change.to === null
                ? omit(config, 'test_timeout_ms')
                : { ...config, test_timeout_ms: change.to }
        case 'leftover_allow':
            return change.to === null
                ? omit(config, 'leftover_allow')
                : { ...config, leftover_allow: change.to }
    }
}

/**
 * `config` with each change's new value: set, or left out for `null`. Pure.
 *
 * @example
 * withConfigChanges({ config, changes: [{ field: 'prepare', from: 'make', to: null }] })
 * // config without prepare
 */
export const withConfigChanges = ({
    config,
    changes,
}: {
    config: EngineConfig
    changes: ConfigChange[]
}): EngineConfig =>
    reduce(
        changes,
        (next, change) => applyChange({ config: next, change }),
        config
    )
