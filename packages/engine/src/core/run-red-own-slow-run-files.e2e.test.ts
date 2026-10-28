import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    happyTurns,
    PRACTICE_ENGINE_CONFIG,
    SUM_TEST,
} from '../testing/practice-repo'

/**
 * Seam 2, the red check runs a ticket's own slow test files through a slow
 * command's `run_files` (#683, part 2), end to end on the practice repo: the
 * fast command runs only `src/`, and the slow entry owns `ui/` with a
 * stand-in `run_files` that logs the files it got (and whether the code is
 * written yet), then exits 0 when a file it got says `stand-in: passes`,
 * runs past the time limit when one says `stand-in: hangs`, and otherwise
 * exits 1 until `src/sum.ts` exists. The gates, commits, pushes, and PR are
 * real.
 */

const FAST_TEST = 'bun test src'
const TIMEOUT_MS = 10_000

const config = {
    ...PRACTICE_ENGINE_CONFIG,
    test_file_patterns: ['src/**/*.test.ts', 'ui/**/*.test.ts'],
    test_timeout_ms: TIMEOUT_MS,
    checks: {
        ...PRACTICE_ENGINE_CONFIG.checks,
        test: FAST_TEST,
        slow_test: [
            {
                run: 'bun test ./ui',
                results: 'pass_fail',
                file_patterns: ['ui/**/*.test.ts'],
                run_files: 'bun scripts/ui-files.ts {files}',
            },
        ],
    },
}

const standIn = (
    log: string
) => `import { appendFileSync, existsSync, readFileSync } from 'node:fs'

const files = process.argv.slice(2)
const coded = existsSync('src/sum.ts')
const given = files.map((file) => "'" + file + "'").join(' ')
appendFileSync(${JSON.stringify(log)}, (coded ? 'code ' : 'before ') + given + '\\n')
const texts = files.map((file) => readFileSync(file, 'utf8'))
if (texts.some((text) => text.includes('stand-in: hangs'))) {
    console.log('ui stand-in hangs')
    await Bun.sleep(120_000)
}
const code = texts.some((text) => text.includes('stand-in: passes')) || coded ? 0 : 1
console.log('ui stand-in got ' + given + ', exits ' + code)
process.exit(code)
`

const MENU_FILE = 'ui/menu.test.ts'
const SHELL_FILE = 'ui/shell.test.ts'
const MENU_NAME = 'the menu sums its prices'
const WRONG_NAME = 'the menu sums its taxes'

/** A UI test that fails until `sum` is exported, with a stand-in marker. */
const menuTest = (marker = '') => `import { expect, test } from 'bun:test'

import * as api from '../src/index'
${marker === '' ? '' : `\n// stand-in: ${marker}\n`}
test('${MENU_NAME}', () => {
    const { sum } = api as { sum?: (args: { numbers: number[] }) => number }
    expect(sum?.({ numbers: [2, 3] })).toBe(5)
})
`

/** An old UI test at the base; the ticket edits its comment only. */
const shellTest = (comment: string) => `import { expect, test } from 'bun:test'

// ${comment}
test('the shell opens', () => {
    expect(['shell']).toHaveLength(1)
})
`

/** The test-writer: the fast sum tests, and `files`, with AC1 also mapped to `menu_name`. */
const writer = ({
    files,
    menu_name,
}: {
    files: Record<string, string>
    menu_name: string
}): ScriptedTurn => ({
    ...happyTurns().testWriter,
    files: { 'src/sum.test.ts': SUM_TEST, ...files },
    result: {
        outcome: 'tests_written',
        criteria: [
            {
                criterion_id: 'AC1',
                tests: [
                    { file: 'src/sum.test.ts', name: 'sum > adds two numbers' },
                    { file: MENU_FILE, name: menu_name },
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
        summary: 'Fast tests and a UI test.',
        assumptions: [],
        run_notes: [],
    },
})

const redChecks = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'red_check' ? [record.content] : []
    )

/** The files the stand-in got before any code was written, one entry per call. */
const beforeCode = async (log: string): Promise<string[]> =>
    existsSync(log)
        ? (await Bun.file(log).text())
              .trim()
              .split('\n')
              .filter((line) => line.startsWith('before '))
              .map((line) => line.slice('before '.length))
        : []

const NOT_IN_RESULTS = 'not found in the test results'

type Run = Awaited<
    ReturnType<Awaited<ReturnType<typeof createPracticeRepo>>['run']>
>

const practiceRun = async ({
    turns,
}: {
    turns: ScriptedTurn[]
}): Promise<{ root: string; log: string; run: Run }> => {
    const root = await mkdtemp(join(tmpdir(), 'luca-engine-red-run-files-'))
    const log = join(root, 'ui-files.log')
    const practice = await createPracticeRepo({
        root,
        config,
        files: {
            'scripts/ui-files.ts': standIn(log),
            [SHELL_FILE]: shellTest('The shell.'),
        },
    })
    const { implementer, reviewer } = happyTurns()
    const run = await practice.run({
        turns: [...turns, implementer, reviewer],
    })
    return { root, log, run }
}

describe("the red check runs a ticket's own slow test files through run_files, end to end", () => {
    let root = ''
    let log = ''
    let run: Run

    beforeAll(async () => {
        ;({ root, log, run } = await practiceRun({
            turns: [
                // Maps a name its UI test file doesn't have.
                writer({
                    files: {
                        [MENU_FILE]: menuTest(),
                        [SHELL_FILE]: shellTest('The shell, with a badge.'),
                    },
                    menu_name: WRONG_NAME,
                }),
                writer({ files: {}, menu_name: MENU_NAME }),
            ],
        }))
    }, 240_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('a UI test the stand-in fails before any code is red, and the stand-in got the quoted file', async () => {
        expect(run.action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const reds = redChecks(run.records)
        expect(reds.map(({ ok }) => ok)).toEqual([false, true])
        const calls = await beforeCode(log)
        expect(calls.length).toBeGreaterThan(0)
        expect(calls.at(-1)).toBe(`'${MENU_FILE}'`)
    })

    test('the red check does not run the UI test file through plain bun test', () => {
        const reds = redChecks(run.records)
        expect(reds.length).toBeGreaterThan(0)
        for (const red of reds) {
            expect(red.tests.command).not.toContain(`./${MENU_FILE}`)
            expect(red.tests.command).not.toMatch(/bun test[^&]*ui\/menu/)
        }
    })

    test('a mapped name not in the UI test file is not found in the file, even when the stand-in exits 1', () => {
        const [refused] = redChecks(run.records)
        expect(refused?.ok).toBe(false)
        const mine = (refused?.problems ?? []).filter((problem) =>
            problem.startsWith(`"${WRONG_NAME}" in ${MENU_FILE}`)
        )
        expect(mine).toHaveLength(1)
        expect(mine[0]).toContain(': not found in the file')
    })

    test('a changed UI test file with no mapped test is not given to the stand-in by the red check', async () => {
        const calls = await beforeCode(log)
        expect(calls.length).toBeGreaterThan(0)
        for (const call of calls) {
            expect(call).toBe(`'${MENU_FILE}'`)
            expect(call).not.toContain(SHELL_FILE)
        }
    })

    test('no red check problem says a UI test was not found in the test results', async () => {
        expect(await beforeCode(log)).not.toEqual([])
        for (const { problems } of redChecks(run.records)) {
            expect(
                problems.filter(
                    (problem) =>
                        problem.includes(MENU_FILE) &&
                        problem.includes(NOT_IN_RESULTS)
                )
            ).toEqual([])
        }
    })
})

describe('the red check judges a UI test by its run_files exit code, end to end', () => {
    let root = ''
    let log = ''
    let run: Run

    beforeAll(async () => {
        ;({ root, log, run } = await practiceRun({
            turns: [
                writer({
                    files: { [MENU_FILE]: menuTest('passes') },
                    menu_name: MENU_NAME,
                }),
                writer({
                    files: { [MENU_FILE]: menuTest('hangs') },
                    menu_name: MENU_NAME,
                }),
                writer({
                    files: { [MENU_FILE]: menuTest() },
                    menu_name: MENU_NAME,
                }),
            ],
        }))
    }, 240_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('a stand-in that exits 0 before any code fails the red check: the slow tests passed', async () => {
        const [passed] = redChecks(run.records)
        expect(passed?.ok).toBe(false)
        expect(
            passed?.problems.filter((problem) =>
                problem.startsWith(
                    'These slow tests passed before any code was written: '
                )
            )
        ).toEqual([
            `These slow tests passed before any code was written: ${MENU_FILE}`,
        ])
        expect((await beforeCode(log))[0]).toBe(`'${MENU_FILE}'`)
    })

    test('a stand-in that runs past test_timeout_ms fails the red check: the slow tests timed out', () => {
        const reds = redChecks(run.records)
        expect(reds.map(({ ok }) => ok)).toEqual([false, false, true])
        expect(
            reds[1]?.problems.filter((problem) =>
                problem.startsWith(
                    'These slow tests timed out in the red check: '
                )
            )
        ).toEqual([`These slow tests timed out in the red check: ${MENU_FILE}`])
        expect(
            reds.flatMap(({ problems }) =>
                problems.filter(
                    (problem) =>
                        problem.includes(MENU_FILE) &&
                        problem.includes(NOT_IN_RESULTS)
                )
            )
        ).toEqual([])
    })
})
