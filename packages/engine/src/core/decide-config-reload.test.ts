import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { decide, type EngineAction } from './decide'
import { recordConfigReload } from './execute'

import { configReloadText } from '../cli/run-modes'
import { loadEngineConfig } from '../config/engine-config'
import type { Journal } from '../journal/journal'
import type { JournalEntry, JournalRecord } from '../journal/journal-record'
import { JournalRecordSchema } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    baselineTests,
    BUILD_CONFIG,
    intakePassed,
    practiceTicket,
    runBranchCreated,
    ticketWorktreeCreated,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * A resume re-reads the repo's config (#516), at seam 1: the decision
 * step handed a journal with a `config_reloaded` (old to new values of the
 * build fields that changed) or a `config_reload_refused` (the file was
 * bad, so the run keeps its config). Replay puts the new values on
 * `state.config`, so the next step, such as a test-writer told about the
 * prepare command, works from them. Old journals have neither record.
 */

const OLD_PREPARE = 'make rom'
const NEW_PREPARE = 'make rom-cached'

/** Intake passed on a config with `OLD_PREPARE`, then `entries`. */
const journal = (entries: JournalEntry[]): JournalEntry[] => {
    const [started, ...rest] = intakePassed({
        tickets: [practiceTicket({ number: 11 })],
    })
    if (started?.kind !== 'run_started') throw new Error('no run_started')
    return [
        {
            ...started,
            content: {
                ...started.content,
                config: { ...BUILD_CONFIG, prepare: OLD_PREPARE },
            },
        },
        ...rest,
        ...withInstalls({ entries }),
    ]
}

/** Up to the test-writer's launch on #11. */
const UP_TO_TESTS: JournalEntry[] = [
    runBranchCreated(),
    ticketWorktreeCreated({ ticket: 11 }),
    baselineTests({ ticket: 11 }),
]

const configReloaded = (
    changes: Extract<
        JournalEntry,
        { kind: 'config_reloaded' }
    >['content']['changes']
): JournalEntry => ({
    kind: 'config_reloaded',
    ticket: null,
    role: null,
    content: { changes },
})

const refused = (reason: string): JournalEntry => ({
    kind: 'config_reload_refused',
    ticket: null,
    role: null,
    content: { reason },
})

const resumed: JournalEntry = {
    kind: 'engine_resumed',
    ticket: null,
    role: null,
    content: { luca_version: '14.0.0-alpha.7' },
}

const stateOf = (entries: JournalEntry[]) =>
    replayRun({ records: recordsFrom({ entries: journal(entries) }) })

const promptOf = (action: EngineAction): string => {
    if (action.type !== 'launch_agent') throw new Error(action.type)
    return action.prompt
}

const nextOf = (entries: JournalEntry[]): EngineAction =>
    decide({ records: recordsFrom({ entries: journal(entries) }) })

describe('a config_reloaded record', () => {
    test('replay puts the new prepare on the run config, and the test-writer is told the new command', () => {
        const entries = [
            ...UP_TO_TESTS,
            resumed,
            configReloaded([
                { field: 'prepare', from: OLD_PREPARE, to: NEW_PREPARE },
            ]),
        ]

        expect(stateOf(entries).config?.prepare).toBe(NEW_PREPARE)
        const prompt = promptOf(nextOf(entries))
        expect(prompt).toContain(NEW_PREPARE)
        expect(prompt).not.toContain(`\`${OLD_PREPARE}\``)
    })

    test('a removed prepare leaves the config with none, and the test-writer hears of none', () => {
        const entries = [
            ...UP_TO_TESTS,
            resumed,
            configReloaded([{ field: 'prepare', from: OLD_PREPARE, to: null }]),
        ]

        expect(stateOf(entries).config?.prepare).toBeUndefined()
        expect(promptOf(nextOf(entries))).not.toContain(
            'This repo has a prepare command'
        )
    })

    test('the time limit and concurrency are set, and frozen fields are as the run started', () => {
        const config = stateOf([
            ...UP_TO_TESTS,
            resumed,
            configReloaded([
                { field: 'prepare_timeout_ms', from: null, to: 60_000 },
                { field: 'prepare_concurrency', from: null, to: 2 },
            ]),
        ]).config

        expect(config).toEqual({
            ...BUILD_CONFIG,
            prepare: OLD_PREPARE,
            prepare_timeout_ms: 60_000,
            prepare_concurrency: 2,
        })
    })

    test('a new test time limit is set on the config (#542)', () => {
        const config = stateOf([
            ...UP_TO_TESTS,
            resumed,
            configReloaded([
                { field: 'test_timeout_ms', from: null, to: 900_000 },
            ]),
        ]).config

        expect(config).toEqual({
            ...BUILD_CONFIG,
            prepare: OLD_PREPARE,
            test_timeout_ms: 900_000,
        })
    })

    test('a new leftover_allow is set on the config, and frozen fields are as the run started (#520)', () => {
        const config = stateOf([
            ...UP_TO_TESTS,
            resumed,
            configReloaded([
                {
                    field: 'leftover_allow',
                    from: null,
                    to: ['handbook/**/*.md'],
                },
            ]),
        ]).config

        expect(config).toEqual({
            ...BUILD_CONFIG,
            prepare: OLD_PREPARE,
            leftover_allow: ['handbook/**/*.md'],
        })
    })

    test('a later reload wins over an earlier one', () => {
        expect(
            stateOf([
                configReloaded([
                    { field: 'prepare', from: OLD_PREPARE, to: 'first' },
                ]),
                ...UP_TO_TESTS,
                configReloaded([
                    { field: 'prepare', from: 'first', to: NEW_PREPARE },
                ]),
            ]).config?.prepare
        ).toBe(NEW_PREPARE)
    })

    test('a change to a frozen field is not a journal record', () => {
        const parsed = JournalRecordSchema.safeParse({
            kind: 'config_reloaded',
            ticket: null,
            role: null,
            seq: 1,
            time: '2026-10-05T12:00:00.000Z',
            content: {
                changes: [{ field: 'checks', from: null, to: 'bun test' }],
            },
        })

        expect(parsed.success).toBe(false)
    })
})

describe('a config_reload_refused record', () => {
    test('the run keeps the config it had, and goes on to the same step', () => {
        const withRefusal = [
            ...UP_TO_TESTS,
            resumed,
            refused('.luca/config.json is not valid JSON'),
        ]

        expect(stateOf(withRefusal).config).toEqual({
            ...BUILD_CONFIG,
            prepare: OLD_PREPARE,
        })
        expect(nextOf(withRefusal)).toEqual(nextOf([...UP_TO_TESTS, resumed]))
    })
})

describe('an old journal, with neither record', () => {
    test('a resume changes no config, and the next step is as before', () => {
        expect(stateOf([...UP_TO_TESTS, resumed]).config).toEqual(
            stateOf(UP_TO_TESTS).config
        )
        expect(promptOf(nextOf([...UP_TO_TESTS, resumed]))).toContain(
            OLD_PREPARE
        )
    })
})

/**
 * The run's journal up to a resume, in memory: intake on a config with
 * `OLD_PREPARE`, then #11 up to its test-writer, then `engine_resumed`.
 */
const resumedJournal = (): Journal => {
    const records: JournalRecord[] = recordsFrom({
        entries: journal([...UP_TO_TESTS, resumed]),
    })
    return {
        file: '',
        append: (entry) => {
            const record = JournalRecordSchema.parse({
                ...entry,
                seq: records.length + 1,
                time: '2026-10-05T12:00:00.000Z',
            })
            records.push(record)
            return record
        },
        read: () => [...records],
    }
}

/**
 * What a resume journals when the repo's `.luca/config.json` holds `text`
 * (no file when `null`), as `luca-run --resume` reads it.
 */
const reloadWith = async ({ text }: { text: string | null }) => {
    const repo_root = await mkdtemp(join(tmpdir(), 'luca-config-reload-'))
    try {
        if (text !== null) {
            await mkdir(join(repo_root, '.luca'))
            await writeFile(join(repo_root, '.luca', 'config.json'), text)
        }
        const run = resumedJournal()
        const before = run.read().length
        const reload = recordConfigReload({
            journal: run,
            loaded: await loadEngineConfig({ repo_root }),
        })
        return { reload, added: run.read().slice(before) }
    } finally {
        await rm(repo_root, { recursive: true, force: true })
    }
}

const STARTED = { ...BUILD_CONFIG, prepare: OLD_PREPARE }

// Moved from `run-config-reload.e2e.test.ts` (#566): what a resume journals
// from the repo's config file needs no run. The run after a reload, and the
// gates running the new prepare, are still end to end there.
describe('what a resume journals from the repo’s config file', () => {
    test('an unchanged config adds no record', async () => {
        const { reload, added } = await reloadWith({
            text: JSON.stringify(STARTED, null, 4),
        })

        expect(reload).toBeNull()
        expect(added).toEqual([])
    })

    test('changes to frozen fields are left out: no record, so the run keeps its checks and patterns', async () => {
        const { reload, added } = await reloadWith({
            text: JSON.stringify({
                ...STARTED,
                checks: { ...STARTED.checks, lint: 'exit 1' },
                test_file_patterns: ['nowhere/**/*.test.ts'],
                rule_files: ['AGENTS.md'],
                run_budget_tokens: 1,
            }),
        })

        expect(reload).toBeNull()
        expect(added).toEqual([])
    })

    test('a config that is not JSON is journaled as refused, and the log says why', async () => {
        const { reload, added } = await reloadWith({ text: '{ "checks": ' })

        expect(added.map(({ kind }) => kind)).toEqual(['config_reload_refused'])
        expect(
            reload?.kind === 'config_reload_refused'
                ? reload.content.reason
                : null
        ).toContain('not valid JSON')
        if (reload === null) throw new Error('no record')
        expect(configReloadText({ reload })).toContain('not valid JSON')
    })

    test('a missing config is journaled as refused', async () => {
        const { reload, added } = await reloadWith({ text: null })

        expect(added).toHaveLength(1)
        expect(
            reload?.kind === 'config_reload_refused'
                ? reload.content.reason
                : null
        ).toContain('No engine config found')
    })

    test('a config intake would refuse (no test command) is refused, with intake’s words, and none of it adopted', async () => {
        const { reload, added } = await reloadWith({
            text: JSON.stringify({
                ...STARTED,
                checks: {},
                prepare: NEW_PREPARE,
            }),
        })

        expect(added.map(({ kind }) => kind)).toEqual(['config_reload_refused'])
        expect(
            reload?.kind === 'config_reload_refused'
                ? reload.content.reason
                : null
        ).toContain('has no test command')
    })
})
