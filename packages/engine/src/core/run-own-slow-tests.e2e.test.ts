import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    git,
    happyTurns,
    PRACTICE_ENGINE_CONFIG,
    SUM,
    SUM_TEST,
} from '../testing/practice-repo'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Seam 2, a ticket's own slow tests (#564), end to end on the practice repo:
 * its config leaves the end-to-end tests out of `checks.test` and names them
 * in `checks.slow_test`, so a test-writer's new slow test file would never
 * run. The red check, the ticket's gates, and (in the unit tests) the
 * already-done check run it on its own, with plain `bun test`; the join's
 * gates do not. The gates, commits, pushes, and PR are real.
 */

const FAST_TEST = "bun test --path-ignore-patterns='**/*.e2e.test.ts'"
const SLOW_TEST = 'bun test .e2e.test'

const SLOW_CONFIG = {
    ...PRACTICE_ENGINE_CONFIG,
    checks: {
        ...PRACTICE_ENGINE_CONFIG.checks,
        test: FAST_TEST,
        slow_test: SLOW_TEST,
    },
}

/** The same repo with no slow command: the e2e files are just left out. */
const NO_SLOW_CONFIG = {
    ...PRACTICE_ENGINE_CONFIG,
    checks: { ...PRACTICE_ENGINE_CONFIG.checks, test: FAST_TEST },
}

const SLOW_FILE = 'src/sum.e2e.test.ts'
const SLOW_NAME = 'sum is exported and adds many numbers'

/** Loads, and fails until `sum` is exported from the entry point. */
const FAILING_SLOW_TEST = `import { expect, test } from 'bun:test'

import * as api from './index'

test('${SLOW_NAME}', () => {
    const { sum } = api as { sum?: (args: { numbers: number[] }) => number }
    expect(sum?.({ numbers: [1, 2, 3, 4] })).toBe(10)
})
`

/** Passes before any code is written. */
const PASSING_SLOW_TEST = `import { expect, test } from 'bun:test'

test('${SLOW_NAME}', () => {
    expect(1 + 2 + 3 + 4).toBe(10)
})
`

/** Imports the code not written yet, so it doesn't load. */
const UNLOADABLE_SLOW_TEST = `import { expect, test } from 'bun:test'

import { sum } from './sum'

test('${SLOW_NAME}', () => {
    expect(sum({ numbers: [1, 2, 3, 4] })).toBe(10)
})
`

/** An old slow test already on `main`, failing until `sum` is exported. */
const LEGACY_FILE = 'src/legacy.e2e.test.ts'
const LEGACY_NAME = 'legacy: sum is exported'
const LEGACY_SLOW_TEST = `import { expect, test } from 'bun:test'

import * as api from './index'

test('${LEGACY_NAME}', () => {
    expect('sum' in api).toBe(true)
})
`

/** A slow test on `main` that covers a ticket whose work is already done. */
const DOUBLE_FILE = 'src/double.e2e.test.ts'
const DOUBLE_SLOW_TEST = `import { expect, test } from 'bun:test'

import { double } from './double'

test('double doubles a number', () => {
    expect(double({ n: 2 })).toBe(4)
})

test('double of zero is zero', () => {
    expect(double({ n: 0 })).toBe(0)
})
`

/** A slow test on `main` that passes, so the final review's slow run has one. */
const OK_SLOW_TEST = `import { expect, test } from 'bun:test'

test('ok', () => {
    expect(1).toBe(1)
})
`

const EXPORT_SUM = "export { sum } from './sum'\n"

/**
 * The test-writer: the fast sum tests, and this slow file for AC1. AC1 maps
 * both of its tests, since the red check refuses a new test the map doesn't
 * name (#581).
 */
const writerTurn = ({
    slow_source,
    mapped,
    files,
}: {
    slow_source?: string
    /** The test AC1 maps to. */
    mapped: { file: string; name: string }
    /** Replaces the files written. */
    files?: Record<string, string>
}): ScriptedTurn => {
    const { testWriter } = happyTurns()
    return {
        ...testWriter,
        files: files ?? {
            'src/sum.test.ts': SUM_TEST,
            [SLOW_FILE]: slow_source ?? FAILING_SLOW_TEST,
        },
        result: {
            outcome: 'tests_written',
            criteria: [
                {
                    criterion_id: 'AC1',
                    tests: [
                        mapped,
                        {
                            file: 'src/sum.test.ts',
                            name: 'sum > adds two numbers',
                        },
                    ],
                },
                {
                    criterion_id: 'AC2',
                    tests: [
                        {
                            file: 'src/sum.test.ts',
                            name: 'sum > of no numbers is zero',
                        },
                    ],
                },
            ],
            summary: 'One test per criterion.',
            assumptions: [],
            run_notes: [],
        },
    }
}

const SLOW_MAPPED = { file: SLOW_FILE, name: SLOW_NAME }

/** Runs the engine once on a practice repo with these turns. */
const practiceRun = async ({
    config,
    files,
    turns,
}: {
    config: object
    files?: Record<string, string>
    turns: ScriptedTurn[]
}) => {
    const root = await mkdtemp(join(tmpdir(), 'luca-engine-own-slow-'))
    try {
        const practice = await createPracticeRepo({ root, config, files })
        return await practice.run({ turns })
    } finally {
        await rm(root, { recursive: true, force: true })
    }
}

const redChecks = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'red_check' ? [record.content] : []
    )

const gatesRuns = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'gates_run'
            ? [{ ...record.content, ticket: record.ticket }]
            : []
    )

describe("a ticket's own slow tests, end to end", () => {
    test('a new slow test that fails is run and counts as failing; the gates run it and fail with its output; the join does not', async () => {
        const { implementer, reviewer } = happyTurns()
        const { action, records, launches } = await practiceRun({
            config: SLOW_CONFIG,
            turns: [
                writerTurn({ mapped: SLOW_MAPPED }),
                // Forgets to export sum: the fast tests pass, the slow one fails.
                { ...implementer, files: { 'src/sum.ts': SUM } },
                { ...implementer, files: { 'src/index.ts': EXPORT_SUM } },
                reviewer,
            ],
        })
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The red check ran the slow file on its own, after the fast command.
        const [red, ...rest] = redChecks(records)
        expect(rest).toEqual([])
        expect(red?.ok).toBe(true)
        expect(red?.tests.command).toStartWith(`${FAST_TEST} && bun test `)
        expect(red?.tests.command).toContain(`'./${SLOW_FILE}'`)
        expect(red?.notes).toContain(
            `"${SLOW_NAME}" in ${SLOW_FILE}: fails, as it should`
        )
        expect(red?.notes.filter((note) => note.includes(SLOW_FILE))).toEqual([
            `"${SLOW_NAME}" in ${SLOW_FILE}: fails, as it should`,
        ])
        expect(red?.tests.cases).toContainEqual(
            expect.objectContaining({
                file: SLOW_FILE,
                full_name: SLOW_NAME,
                status: 'failed',
            })
        )
        expect(red?.tests.files_without_results).not.toContain(SLOW_FILE)

        // The ticket's gates run it as one more test check; a failure is a
        // failed test gate, with its output, for the implementer to fix.
        const ticketGates = gatesRuns(records).filter(
            ({ ticket, target }) => ticket === 11 && target === 'ticket'
        )
        expect(ticketGates.map(({ ok }) => ok)).toEqual([false, true])
        const [failed, passed] = ticketGates
        expect(failed?.checks.map(({ name }) => name)).toEqual([
            'test',
            'test',
            'types',
            'lint',
        ])
        expect(failed?.checks[0]).toMatchObject({
            command: FAST_TEST,
            ok: true,
        })
        expect(failed?.checks[1]).toMatchObject({
            command: `bun test './${SLOW_FILE}'`,
            ok: false,
        })
        expect(failed?.checks[1]?.output).toContain(SLOW_NAME)
        expect(
            passed?.checks.map(({ command, ok }) => ({ command, ok }))
        ).toContainEqual({ command: `bun test './${SLOW_FILE}'`, ok: true })

        const fixes = launches.filter(
            ({ kind, role }) => kind === 'follow_up' && role === 'implementer'
        )
        expect(fixes).toHaveLength(1)
        expect(fixes[0]?.prompt).toContain('The gates failed.')
        expect(fixes[0]?.prompt).toContain('test failed:')
        expect(fixes[0]?.prompt).toContain(SLOW_NAME)

        // The join's gates, on the run branch with the ticket set, don't.
        const joinGates = gatesRuns(records).filter(
            ({ ticket, target }) => ticket === 11 && target === 'run_branch'
        )
        expect(joinGates.length).toBeGreaterThan(0)
        for (const { ok, checks } of joinGates) {
            expect(ok).toBe(true)
            expect(checks.map(({ name }) => name)).toEqual([
                'test',
                'types',
                'lint',
            ])
            expect(
                checks.some(({ command }) => command.includes('./src/'))
            ).toBe(false)
        }
    }, 120_000)

    test('a new slow test that passes already is refused; one whose file does not load yet still counts as failing', async () => {
        const { implementer, reviewer } = happyTurns()
        const { action, records, launches } = await practiceRun({
            config: SLOW_CONFIG,
            turns: [
                writerTurn({
                    mapped: SLOW_MAPPED,
                    slow_source: PASSING_SLOW_TEST,
                }),
                // The follow-up rewrites it against code not written yet.
                writerTurn({
                    mapped: SLOW_MAPPED,
                    files: { [SLOW_FILE]: UNLOADABLE_SLOW_TEST },
                }),
                implementer,
                reviewer,
            ],
        })
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        const [refused, accepted, ...rest] = redChecks(records)
        expect(rest).toEqual([])
        expect(refused?.ok).toBe(false)
        expect(refused?.problems).toContain(
            `"${SLOW_NAME}" in ${SLOW_FILE}: passes already (it must fail before any code is written)`
        )
        expect(refused?.tests.command).toContain(`'./${SLOW_FILE}'`)
        const followUp = launches.find(
            ({ kind, role }) => kind === 'follow_up' && role === 'test-writer'
        )
        expect(followUp?.prompt).toContain('passes already')

        expect(accepted?.ok).toBe(true)
        expect(accepted?.notes).toContain(
            `"${SLOW_NAME}" in ${SLOW_FILE}: fails (its file does not load yet)`
        )
        expect(accepted?.tests.files_without_results).toContain(SLOW_FILE)
    }, 120_000)

    test('a slow file the test map names but the ticket did not change is run by the red check, and not by the ticket gates', async () => {
        const { implementer, reviewer } = happyTurns()
        const { action, records } = await practiceRun({
            config: SLOW_CONFIG,
            files: { [LEGACY_FILE]: LEGACY_SLOW_TEST },
            turns: [
                writerTurn({
                    mapped: { file: LEGACY_FILE, name: LEGACY_NAME },
                    files: { 'src/sum.test.ts': SUM_TEST },
                }),
                implementer,
                reviewer,
            ],
        })
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        const [red] = redChecks(records)
        expect(red?.ok).toBe(true)
        expect(red?.tests.command).toContain(`'./${LEGACY_FILE}'`)
        expect(red?.notes).toContain(
            `"${LEGACY_NAME}" in ${LEGACY_FILE}: fails, as it should`
        )

        const ticketGates = gatesRuns(records).filter(
            ({ ticket, target }) => ticket === 11 && target === 'ticket'
        )
        expect(ticketGates.map(({ ok }) => ok)).toEqual([true])
        expect(
            ticketGates[0]?.checks.some(({ command }) =>
                command.includes(LEGACY_FILE)
            )
        ).toBe(false)
    }, 120_000)

    test('the already-done check runs a named slow test, with plain bun test, and passes when it passes on the base', async () => {
        const root = await mkdtemp(join(tmpdir(), 'luca-engine-own-slow-'))
        try {
            const practice = await createPracticeRepo({
                root,
                config: SLOW_CONFIG,
                files: {
                    'src/double.ts':
                        'export const double = ({ n }: { n: number }): number => n * 2\n',
                    [DOUBLE_FILE]: DOUBLE_SLOW_TEST,
                },
            })
            const sha = (await git(practice.repo, 'rev-parse', 'HEAD')).trim()
            const tracker = createInMemoryTracker({
                issues: [
                    specIssue({ number: 10 }),
                    ticketIssue({
                        number: 11,
                        title: 'Add double',
                        criteria: [
                            'double doubles a number',
                            'double of zero is zero',
                        ],
                    }),
                ],
                sub_tickets: { 10: [11] },
            })

            const { action, records } = await practice.run({
                tracker,
                turns: [
                    {
                        role: 'test-writer',
                        ticket: 11,
                        result: {
                            outcome: 'already_done',
                            done_by: [
                                { sha, title: 'feat: add double (#482)' },
                            ],
                            criteria: [
                                {
                                    criterion_id: 'AC1',
                                    tests: [
                                        {
                                            file: DOUBLE_FILE,
                                            name: 'double doubles a number',
                                        },
                                    ],
                                },
                                {
                                    criterion_id: 'AC2',
                                    tests: [
                                        {
                                            file: DOUBLE_FILE,
                                            name: 'double of zero is zero',
                                        },
                                    ],
                                },
                            ],
                            summary: 'PR #482 already added the double.',
                        },
                    },
                ],
            })

            expect(action).toEqual({ type: 'done', outcome: 'nothing_to_do' })
            const checked = records.find(
                (record) => record.kind === 'already_done_checked'
            )
            if (checked?.kind !== 'already_done_checked') {
                throw new Error('no already-done check')
            }
            expect(checked.content).toMatchObject({ ok: true, problems: [] })
            expect(checked.content.tests?.command).toBe(
                `bun test './${DOUBLE_FILE}'`
            )
            expect(
                checked.content.tests?.cases.map(({ status }) => status)
            ).toEqual(['passed', 'passed'])
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    }, 120_000)

    test("a new fast test that can't load yet leaves the red run, and its output, as the fast command's alone", async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practiceRun({
            config: SLOW_CONFIG,
            // The final review's slow tests need one to run.
            files: { 'src/ok.e2e.test.ts': OK_SLOW_TEST },
            turns: [testWriter, implementer, reviewer],
        })
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // sum.test.ts imports code not written yet, so the fast run gave it
        // no results and it ran again on its own, and gave none again: the
        // red run is the fast run, not two runs joined.
        const [red] = redChecks(records)
        expect(red?.ok).toBe(true)
        expect(red?.tests.command).toBe(FAST_TEST)
        expect(red?.tests.output).not.toContain('$ bun test')
        expect(red?.tests.files_without_results).toContain('src/sum.test.ts')

        const ticketGates = gatesRuns(records).filter(
            ({ ticket, target }) => ticket === 11 && target === 'ticket'
        )
        expect(ticketGates.map(({ ok }) => ok)).toEqual([true])
        expect(ticketGates[0]?.checks.map(({ command }) => command)[0]).toBe(
            FAST_TEST
        )
        expect(ticketGates[0]?.checks.map(({ name }) => name)).toEqual([
            'test',
            'types',
            'lint',
        ])
    }, 120_000)

    test('a repo with no slow command runs exactly the commands it runs today', async () => {
        const { implementer, reviewer } = happyTurns()
        const { action, records } = await practiceRun({
            config: NO_SLOW_CONFIG,
            turns: [
                writerTurn({ mapped: SLOW_MAPPED }),
                // Nothing runs the slow file, so this passes the gates.
                { ...implementer, files: { 'src/sum.ts': SUM } },
                reviewer,
            ],
        })
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        const [red] = redChecks(records)
        expect(red?.tests.command).toBe(FAST_TEST)

        const gates = gatesRuns(records)
        expect(gates.length).toBeGreaterThan(0)
        for (const { checks } of gates) {
            expect(checks.map(({ name }) => name)).toEqual([
                'test',
                'types',
                'lint',
            ])
            expect(
                checks.some(({ command }) => command.includes('./src/'))
            ).toBe(false)
        }
    }, 120_000)
})
