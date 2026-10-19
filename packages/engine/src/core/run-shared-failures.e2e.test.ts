import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { ticketIssue } from '../testing/intake-fixtures'
import { waitUntil } from '../testing/many-tickets'
import {
    APPROVE,
    createPracticeRepo,
    IMPLEMENTER_RESULT,
    latestStuck,
    PRACTICE_SPEC_NUMBER,
    practiceSpec,
    SUM,
    SUM_TEST,
    sumTicket,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Shared failures (#544), end to end: the practice repo has an old test
 * that fails only while another test run holds its shared lock folder, and
 * only once it is armed. #11 and #12 build at once; their implementers each
 * wait for the other, then arm it, so both tickets' gates run at the same
 * time and fail on that old test. The engine reruns the second one's gates
 * alone, and alone the old test passes (and disarms itself).
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-shared-failures-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const SHARED = {
    file: 'src/shared.test.ts',
    full_name: 'shared lock > is ours alone',
}

/** The old test: armed, it fails when another run holds the lock folder. */
const sharedTest = ({
    locks,
    armed,
}: {
    locks: string
    armed: string
}): string => `import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const LOCKS = ${JSON.stringify(locks)}
const ARMED = ${JSON.stringify(armed)}

describe('shared lock', () => {
    test('is ours alone', async () => {
        if (!existsSync(ARMED)) {
            expect(existsSync(ARMED)).toBe(false)
            return
        }
        mkdirSync(LOCKS, { recursive: true })
        const mine = String(process.pid)
        writeFileSync(join(LOCKS, mine), '')
        let others = 0
        for (let tick = 0; tick < 30; tick += 1) {
            const now = readdirSync(LOCKS).filter((name) => name !== mine)
            others = Math.max(others, now.length)
            await Bun.sleep(100)
        }
        rmSync(join(LOCKS, mine), { force: true })
        // Alone, it disarms, so every later run passes at once.
        if (others === 0) rmSync(ARMED, { force: true })
        expect(others).toBe(0)
    }, 10_000)
})
`

const DOUBLE_TEST = `import { describe, expect, test } from 'bun:test'

import { double } from './double'

describe('double', () => {
    test('of two is four', () => {
        expect(double({ value: 2 })).toBe(4)
    })

    test('of zero is zero', () => {
        expect(double({ value: 0 })).toBe(0)
    })
})
`

const DOUBLE = `export const double = ({ value }: { value: number }): number => value * 2
`

/**
 * The turns: #11's and #12's implementers each wait for the other to start,
 * then arm the old test. Each ticket also has a follow-up implementer turn
 * that changes nothing, for a ticket whose failure the engine saw first and
 * sent to the usual fix round.
 */
const turns = ({ armed }: { armed: string }): ScriptedTurn[] => {
    const started = new Set<number>()
    const arm = (ticket: number, other: number) => async () => {
        started.add(ticket)
        await waitUntil({
            check: () => started.has(other),
            what: `#${other}'s implementer to start`,
        })
        await Bun.write(armed, 'armed\n')
    }
    return [
        {
            role: 'test-writer',
            ticket: 11,
            files: { 'src/sum.test.ts': SUM_TEST },
            result: TEST_WRITER_RESULT,
        },
        {
            role: 'test-writer',
            ticket: 12,
            files: { 'src/double.test.ts': DOUBLE_TEST },
            result: {
                ...TEST_WRITER_RESULT,
                criteria: [
                    {
                        criterion_id: 'AC1',
                        tests: [
                            {
                                file: 'src/double.test.ts',
                                name: 'double > of two is four',
                            },
                        ],
                    },
                    {
                        criterion_id: 'AC2',
                        tests: [
                            {
                                file: 'src/double.test.ts',
                                name: 'double > of zero is zero',
                            },
                        ],
                    },
                ],
            },
        },
        {
            role: 'implementer',
            ticket: 11,
            files: {
                'src/sum.ts': SUM,
                'src/index.ts': "export { sum } from './sum'\n",
            },
            act: arm(11, 12),
            result: IMPLEMENTER_RESULT,
        },
        {
            role: 'implementer',
            ticket: 12,
            files: { 'src/double.ts': DOUBLE },
            act: arm(12, 11),
            result: { ...IMPLEMENTER_RESULT, summary: 'Added double.' },
        },
        { role: 'implementer', ticket: 11, result: IMPLEMENTER_RESULT },
        { role: 'implementer', ticket: 12, result: IMPLEMENTER_RESULT },
        { role: 'ticket-reviewer', ticket: 11, result: APPROVE },
        { role: 'ticket-reviewer', ticket: 12, result: APPROVE },
    ]
}

const tracker = () =>
    createInMemoryTracker({
        issues: [
            practiceSpec(),
            sumTicket(),
            ticketIssue({
                number: 12,
                title: 'Add double',
                criteria: ['double of two is four', 'double of zero is zero'],
            }),
        ],
        sub_tickets: { [PRACTICE_SPEC_NUMBER]: [11, 12] },
    })

type GatesRecord = Extract<JournalRecord, { kind: 'gates_run' }>

/** A ticket's own gates, oldest first. */
const ticketGates = ({
    records,
    ticket,
}: {
    records: JournalRecord[]
    ticket: number
}): GatesRecord[] =>
    records.filter(
        (record): record is GatesRecord =>
            record.kind === 'gates_run' &&
            record.ticket === ticket &&
            record.content.target === 'ticket'
    )

describe('shared failures, end to end (#544)', () => {
    test("two tickets' gates fail on the same old test while they run at once, and the second passes on its lone rerun", async () => {
        const armed = join(root, 'armed')
        const practice = await createPracticeRepo({
            root,
            files: {
                'src/shared.test.ts': sharedTest({
                    locks: join(root, 'locks'),
                    armed,
                }),
            },
        })

        const { action, records } = await practice.run({
            turns: turns({ armed }),
            tracker: tracker(),
        })

        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // Both tickets' gates failed on the old test, and journaled it.
        const failures = [11, 12].map((ticket) => {
            const failed = ticketGates({ records, ticket }).find(
                ({ content }) => !content.ok
            )
            expect(failed?.content).toMatchObject({
                failed_cases: expect.arrayContaining([SHARED]),
            })
            if (failed === undefined) {
                throw new Error(`no failure on #${ticket}`)
            }
            return failed
        })

        // The later failure's next gates are its lone rerun, which passed,
        // with no fix round in between.
        const second = failures.toSorted((a, b) => b.seq - a.seq)[0]
        if (second === undefined || second.ticket === null) {
            throw new Error('no second failure')
        }
        const rerun = ticketGates({ records, ticket: second.ticket }).find(
            ({ seq }) => seq > second.seq
        )
        expect(rerun?.content).toMatchObject({ ok: true, exclusive: true })
        const fixes = records.filter(
            (record) =>
                record.kind === 'agent_started' &&
                record.ticket === second.ticket &&
                record.seq > second.seq &&
                record.seq < (rerun?.seq ?? 0)
        )
        expect(fixes).toEqual([])
    }, 120_000)
})
