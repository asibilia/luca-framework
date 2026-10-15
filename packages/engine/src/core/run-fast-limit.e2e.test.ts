import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    happyTurns,
    PRACTICE_ENGINE_CONFIG,
} from '../testing/practice-repo'

/**
 * Seam 2, the fast test speed limit (#580), end to end on the practice repo:
 * `test_case_timeout_ms` goes to the fast `bun` command in every run of it,
 * and the ticket's own gates also hold the tests of the files it changed to
 * it by measured time (a test's own timeout option overrides `--timeout`).
 * The gates, commits, pushes, and PR are real.
 */

const LIMIT_MS = 150
const FAST_COMMAND = `bun test --timeout=${LIMIT_MS}`

const LIMIT_CONFIG = {
    ...PRACTICE_ENGINE_CONFIG,
    test_case_timeout_ms: LIMIT_MS,
}

/** The writer's sum tests, one of them over the limit under its own longer timeout. */
const SLOW_SUM_TEST = `import { describe, expect, test } from 'bun:test'

import { sum } from './sum'

describe('sum', () => {
    test('adds two numbers', () => {
        expect(sum({ numbers: [1, 2] })).toBe(3)
    })

    test('of no numbers is zero', async () => {
        await Bun.sleep(${LIMIT_MS * 2})
        expect(sum({ numbers: [] })).toBe(0)
    }, 10_000)
})
`

/** An old test already on `main`, over the limit under its own timeout. */
const OLD_NAP_TEST = `import { expect, test } from 'bun:test'

test('an old test that naps', async () => {
    await Bun.sleep(${LIMIT_MS * 2})
    expect(1).toBe(1)
}, 10_000)
`

/** Runs the engine once on a practice repo with the limit in its config. */
const practiceRun = async ({
    files,
    turns,
}: {
    files?: Record<string, string>
    turns: ScriptedTurn[]
}) => {
    const root = await mkdtemp(join(tmpdir(), 'luca-engine-fast-limit-'))
    try {
        const practice = await createPracticeRepo({
            root,
            config: LIMIT_CONFIG,
            files,
        })
        return await practice.run({ turns })
    } finally {
        await rm(root, { recursive: true, force: true })
    }
}

const gatesRuns = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'gates_run'
            ? [{ ...record.content, ticket: record.ticket }]
            : []
    )

describe('the fast test speed limit, end to end', () => {
    test('every run of the fast command gets --timeout, and a changed file with a test over the limit fails the ticket gates', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practiceRun({
            turns: [
                { ...testWriter, files: { 'src/sum.test.ts': SLOW_SUM_TEST } },
                // The code is right and the test is slow, and nothing here
                // changes that: every fix round fails the same way.
                implementer,
                implementer,
                implementer,
                implementer,
                reviewer,
            ],
        })

        // The baseline and the red check ran the command with the limit.
        const baseline = records.find(({ kind }) => kind === 'baseline_tests')
        if (baseline?.kind !== 'baseline_tests') throw new Error('no baseline')
        expect(baseline.content.command).toBe(FAST_COMMAND)
        const red = records.find(({ kind }) => kind === 'red_check')
        if (red?.kind !== 'red_check') throw new Error('no red check')
        expect(red.content.tests.command).toBe(FAST_COMMAND)

        // The ticket's gates measure the changed file's tests.
        const [first] = gatesRuns(records).filter(
            ({ ticket, target }) => ticket === 11 && target === 'ticket'
        )
        expect(first?.ok).toBe(false)
        const check = first?.checks.find(({ name }) => name === 'test')
        expect(check?.command).toBe(FAST_COMMAND)
        expect(check?.output).toContain(
            'src/sum.test.ts > sum > of no numbers is zero'
        )
        expect(check?.output).toContain(
            `A fast test may take at most ${LIMIT_MS} ms (\`test_case_timeout_ms\`).`
        )
        expect(action).toMatchObject({ type: 'wait_for_reply' })
    }, 120_000)

    test("a test over the limit in a file the ticket didn't change doesn't fail any gates, the join's and the final review's included", async () => {
        const { action, records } = await practiceRun({
            files: { 'src/old-nap.test.ts': OLD_NAP_TEST },
            turns: Object.values(happyTurns()),
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const gates = gatesRuns(records)
        expect(gates.map(({ target }) => target)).toContain('ticket')
        expect(gates.map(({ target }) => target)).toContain('run_branch')
        for (const { ok, checks } of gates) {
            expect(ok).toBe(true)
            expect(checks.find(({ name }) => name === 'test')?.command).toBe(
                FAST_COMMAND
            )
        }
    }, 120_000)
})
