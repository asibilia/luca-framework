import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    happyTurns,
    PRACTICE_ENGINE_CONFIG,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Seam 2, a ticket's own slow tests through a slow command's `run_files`
 * (#683), end to end on the practice repo: the fast command runs only
 * `src/`, and the slow entry owns `ui/` with a stand-in `run_files` that
 * writes the files it got to a log and exits with the codes the test picks.
 * A ticket's gates run its own `ui/` files through it as `own_slow_test`;
 * the join's gates don't, and the final review still runs the whole slow
 * suite. The gates, commits, pushes, and PR are real.
 */

const FAST_TEST = 'bun test src'
const RUN_FILES = 'bun scripts/ui-files.ts {files}'
const QUOTED = "'ui/menu.test.ts' 'ui/shell.test.ts'"

const config = {
    ...PRACTICE_ENGINE_CONFIG,
    test_file_patterns: ['src/**/*.test.ts', 'ui/**/*.test.ts'],
    checks: {
        ...PRACTICE_ENGINE_CONFIG.checks,
        test: FAST_TEST,
        slow_test: [
            {
                run: 'bun test ./ui',
                results: 'pass_fail',
                file_patterns: ['ui/**/*.test.ts'],
                run_files: RUN_FILES,
            },
        ],
    },
}

/**
 * The stand-in for a UI test runner: it logs the files it got, each in
 * single quotes, one line per call, and exits with `codes[call]` (the last
 * code once they run out).
 */
const standIn = ({
    log,
    codes,
}: {
    log: string
    codes: number[]
}) => `import { appendFileSync, readFileSync } from 'node:fs'

const log = ${JSON.stringify(log)}
const given = process.argv.slice(2).map((file) => "'" + file + "'").join(' ')
appendFileSync(log, given + '\\n')
const calls = readFileSync(log, 'utf8').trim().split('\\n').length
const codes = ${JSON.stringify(codes)}
const code = codes[Math.min(calls, codes.length) - 1] ?? 0
console.log('ui stand-in got ' + given + ', exits ' + code)
process.exit(code)
`

/** A UI test that fails until `sum` is exported from the entry point. */
const uiTest = (name: string) => `import { expect, test } from 'bun:test'

import * as api from '../src/index'

test('${name}', () => {
    const { sum } = api as { sum?: (args: { numbers: number[] }) => number }
    expect(sum?.({ numbers: [2, 3] })).toBe(5)
})
`

const MENU_NAME = 'the menu sums its prices'
const SHELL_NAME = 'the shell sums its badges'

/** The test-writer: the fast sum tests and two UI test files, all mapped. */
const uiWriter = (): ScriptedTurn => ({
    ...happyTurns().testWriter,
    files: {
        'src/sum.test.ts': SUM_TEST,
        'ui/menu.test.ts': uiTest(MENU_NAME),
        'ui/shell.test.ts': uiTest(SHELL_NAME),
    },
    result: {
        outcome: 'tests_written',
        criteria: [
            {
                criterion_id: 'AC1',
                tests: [
                    { file: 'src/sum.test.ts', name: 'sum > adds two numbers' },
                    { file: 'ui/menu.test.ts', name: MENU_NAME },
                ],
            },
            {
                criterion_id: 'AC2',
                tests: [
                    {
                        file: 'src/sum.test.ts',
                        name: 'sum > of no numbers is zero',
                    },
                    { file: 'ui/shell.test.ts', name: SHELL_NAME },
                ],
            },
        ],
        summary: 'Fast tests and UI tests.',
        assumptions: [],
        run_notes: [],
    },
})

const gatesRuns = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'gates_run'
            ? [{ ...record.content, ticket: record.ticket }]
            : []
    )

const PRODUCT_TEST = `import { describe, expect, test } from 'bun:test'

import { product } from './product'

describe('product', () => {
    test('multiplies two numbers', () => {
        expect(product({ numbers: [2, 3] })).toBe(6)
    })

    test('of no numbers is one', () => {
        expect(product({ numbers: [] })).toBe(1)
    })
})
`

const PRODUCT = `export const product = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce((total, each) => total * each, 1)
`

/**
 * #12 "Add product": it changes only `src/` (and not `src/index.ts`, so it
 * doesn't clash with #11), so no file of its own belongs to the slow entry.
 */
const productTurns = (): ScriptedTurn[] => {
    const { testWriter, implementer, reviewer } = happyTurns()
    return [
        {
            ...testWriter,
            ticket: 12,
            files: { 'src/product.test.ts': PRODUCT_TEST },
            result: {
                ...TEST_WRITER_RESULT,
                criteria: [
                    {
                        criterion_id: 'AC1',
                        tests: [
                            {
                                file: 'src/product.test.ts',
                                name: 'product > multiplies two numbers',
                            },
                        ],
                    },
                    {
                        criterion_id: 'AC2',
                        tests: [
                            {
                                file: 'src/product.test.ts',
                                name: 'product > of no numbers is one',
                            },
                        ],
                    },
                ],
            },
        },
        { ...implementer, ticket: 12, files: { 'src/product.ts': PRODUCT } },
        { ...reviewer, ticket: 12 },
    ]
}

/** Spec #10 with #11 "Add sum" (with UI tests) and #12 "Add product", independent. */
const twoTicketTracker = () =>
    createInMemoryTracker({
        issues: [
            specIssue({ number: 10, title: 'Practice spec' }),
            ticketIssue({
                number: 11,
                title: 'Add sum',
                criteria: ['sum adds two numbers', 'sum of no numbers is zero'],
            }),
            ticketIssue({
                number: 12,
                title: 'Add product',
                criteria: [
                    'product multiplies two numbers',
                    'product of no numbers is one',
                ],
            }),
        ],
        sub_tickets: { 10: [11, 12] },
    })

/** A gates run's check names, as plain strings. */
const checkNames = ({ checks }: { checks: { name: string }[] }): string[] =>
    checks.map(({ name }) => name)

/** The lines the stand-in logged, one per call; none when it never ran. */
const logged = async (log: string): Promise<string[]> =>
    existsSync(log) ? (await Bun.file(log).text()).trim().split('\n') : []

describe("a ticket's own slow tests through run_files, end to end", () => {
    let root = ''
    let log = ''
    let run: Awaited<
        ReturnType<Awaited<ReturnType<typeof createPracticeRepo>>['run']>
    >

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-run-files-'))
        log = join(root, 'ui-files.log')
        const practice = await createPracticeRepo({
            root,
            config,
            // Fails #11's first ticket gates, passes after.
            files: { 'scripts/ui-files.ts': standIn({ log, codes: [1, 0] }) },
        })
        const { implementer, reviewer } = happyTurns()
        run = await practice.run({
            tracker: twoTicketTracker(),
            turns: [
                uiWriter(),
                // Forgets to export sum: the fast tests pass, the UI ones don't.
                { ...implementer, files: { 'src/sum.ts': SUM } },
                {
                    ...implementer,
                    files: { 'src/index.ts': "export { sum } from './sum'\n" },
                },
                reviewer,
                ...productTurns(),
            ],
        })
    }, 240_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    const ticketGates = () =>
        gatesRuns(run.records).filter(
            ({ ticket, target }) => ticket === 11 && target === 'ticket'
        )

    /** The checks in #11's ticket gates that ran the stand-in. */
    const ownSlowChecks = () =>
        ticketGates().flatMap(({ checks }) =>
            checks.filter(({ command }) =>
                command.startsWith('bun scripts/ui-files.ts')
            )
        )

    test("the ticket's gates have an own_slow_test check, after the test checks, and the stand-in got exactly the quoted files", async () => {
        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const gates = ticketGates()
        expect(gates.length).toBeGreaterThan(0)
        for (const { checks } of gates) {
            expect(checkNames({ checks })).toEqual([
                'test',
                'own_slow_test',
                'types',
                'lint',
            ])
        }
        // Once per ticket gates; the join's gates never call it.
        expect(await logged(log)).toEqual(gates.map(() => QUOTED))
    })

    test("the own_slow_test check's recorded command is filled in", () => {
        for (const { checks } of ticketGates()) {
            const command = checks[1]?.command ?? ''
            expect(command).toBe(`bun scripts/ui-files.ts ${QUOTED}`)
            expect(command).not.toContain('{files}')
        }
    })

    test('a stand-in that exits 1 fails the gates, with its output in the own_slow_test check', () => {
        const [failed, passed, ...rest] = ticketGates()
        expect(rest).toEqual([])
        expect(failed?.ok).toBe(false)
        expect(failed?.checks[0]).toMatchObject({
            command: FAST_TEST,
            ok: true,
        })
        expect(failed?.checks[1]).toMatchObject({
            name: 'own_slow_test',
            ok: false,
        })
        expect(failed?.checks[1]?.output).toContain(
            `ui stand-in got ${QUOTED}, exits 1`
        )
        expect(passed?.ok).toBe(true)
        expect(passed?.checks[1]).toMatchObject({
            name: 'own_slow_test',
            ok: true,
        })
    })

    test('a ticket that changes no ui file has no own_slow_test check in its gates', () => {
        expect(ownSlowChecks()).not.toEqual([])
        const productGates = gatesRuns(run.records).filter(
            ({ ticket, target }) => ticket === 12 && target === 'ticket'
        )
        expect(productGates.length).toBeGreaterThan(0)
        for (const { ok, checks } of productGates) {
            expect(ok).toBe(true)
            expect(checks.map(({ name }) => name)).toEqual([
                'test',
                'types',
                'lint',
            ])
        }
    })

    test('no run_branch gates have an own_slow_test check', () => {
        expect(ownSlowChecks()).not.toEqual([])
        const joinGates = gatesRuns(run.records).filter(
            ({ target }) => target === 'run_branch'
        )
        expect(joinGates.length).toBeGreaterThan(0)
        for (const { checks } of joinGates) {
            expect(checkNames({ checks })).not.toContain('own_slow_test')
        }
    })

    test('the ui files are not run through the own-files bun test run', () => {
        for (const { checks } of ticketGates()) {
            expect(
                checks.filter(
                    ({ name, command }) =>
                        name === 'test' && command.includes('ui/menu.test.ts')
                )
            ).toEqual([])
        }
    })

    test('the final review still runs the whole slow suite, by its run command', async () => {
        const slow = gatesRuns(run.records).filter(
            ({ target }) => target === 'final_slow'
        )
        expect(slow).toHaveLength(1)
        expect(slow[0]).toMatchObject({ ticket: null, ok: true })
        expect(slow[0]?.checks.map(({ command }) => command)).toEqual([
            'bun test ./ui',
        ])
        // The stand-in ran only in #11's ticket gates.
        const calls = await logged(log)
        expect(calls.length).toBeGreaterThan(0)
        expect(calls).toHaveLength(ticketGates().length)
    })
})
