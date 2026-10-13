import { describe, expect, test } from 'bun:test'

import { decide, type EngineAction } from './decide'

import type { JournalEntry } from '../journal/journal-record'
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
