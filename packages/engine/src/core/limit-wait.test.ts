import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { AgentSessionSchema } from '../agents/agent-launcher'
import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import type { EngineClock } from '../limits/limit-wait'
import { rateLimitReading } from '../testing/build-fixtures'
import {
    createPracticeRepo,
    happyTurns,
    practiceTracker,
} from '../testing/practice-repo'

/**
 * Seam 2 for plan limits: the practice ticket, end to end, with a scripted
 * agent cut off by the plan, a fake clock, and the in-memory tracker. Nothing
 * really waits, and nothing is posted anywhere but in memory.
 */

let root = ''
let practice: Awaited<ReturnType<typeof createPracticeRepo>>

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-limits-'))
    practice = await createPracticeRepo({ root })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** A clock that starts at `start` and moves only when slept. */
const fakeClock = ({
    start,
    crash_on_sleep,
}: {
    start: string
    /** Throw on the first sleep, as if the engine died mid-wait. */
    crash_on_sleep?: boolean
}) => {
    let now = Date.parse(start)
    const slept: number[] = []
    const clock: EngineClock = {
        now: () => now,
        sleep: async (ms) => {
            if (crash_on_sleep) throw new Error('The engine died mid-wait.')
            slept.push(ms)
            now += ms
        },
    }
    return { clock, slept, now: () => new Date(now).toISOString() }
}

/** The test-writer's first turn, cut off by the plan with these readings. */
const cutOff = (
    rate_limit_events: Record<string, unknown>[]
): ScriptedTurn => ({
    role: 'test-writer',
    ticket: 11,
    failure: 'plan',
    error: 'The plan said no.',
    session: AgentSessionSchema.parse({
        session_id: 'cut-1',
        rate_limit_events,
    }),
})

const kinds = (records: JournalRecord[]) => records.map(({ kind }) => kind)

const START = '2026-09-23T12:00:00.000Z'
const RESET = '2026-09-23T14:00:00.000Z'

describe('limit waits', () => {
    test('a rejected limit waits until the reset, tells the spec once, then builds on', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const tracker = practiceTracker()
        const time = fakeClock({ start: START })
        const { action, records } = await practice.run({
            turns: [
                cutOff([
                    rateLimitReading({
                        status: 'rejected',
                        rate_limit_type: 'five_hour',
                        resets_at: RESET,
                    }),
                ]),
                testWriter,
                implementer,
                reviewer,
            ],
            tracker,
            clock: time.clock,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(time.now()).toBe('2026-09-23T14:01:00.000Z')
        expect(records.filter(({ kind }) => kind === 'agent_failed')).toEqual(
            []
        )
        const started = records.find(
            ({ kind }) => kind === 'limit_wait_started'
        )
        expect(started).toMatchObject({
            ticket: null,
            content: {
                resets_at: RESET,
                until: '2026-09-23T14:01:00.000Z',
                rate_limit_type: 'five_hour',
                hit_ticket: 11,
                hit_role: 'test-writer',
            },
        })
        expect(kinds(records)).toContain('limit_wait_ended')
        const comments = tracker.commentsOn({ number: 10 })
        expect(comments).toHaveLength(1)
        expect(comments[0]).toContain('five-hour')
        expect(comments[0]).toContain(RESET)
    }, 60_000)

    test('a limit wait survives a restart: the new engine waits out the rest and does not post again', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const tracker = practiceTracker()
        const reading = rateLimitReading({
            status: 'rejected',
            rate_limit_type: 'seven_day',
            resets_at: '2026-09-26T11:00:00.000Z',
        })

        await expect(
            practice.run({
                turns: [cutOff([reading])],
                tracker,
                clock: fakeClock({ start: START, crash_on_sleep: true }).clock,
            })
        ).rejects.toThrow('The engine died mid-wait.')
        expect(kinds(practice.journal.read())).toContain('limit_wait_started')

        const later = fakeClock({ start: '2026-09-25T00:00:00.000Z' })
        const { action } = await practice.run({
            turns: [testWriter, implementer, reviewer],
            tracker,
            clock: later.clock,
            resume: true,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(later.now()).toBe('2026-09-26T11:01:00.000Z')
        expect(tracker.commentsOn({ number: 10 })).toHaveLength(1)
    }, 60_000)

    test('a wait whose reset passed while the engine was down ends at once', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        await expect(
            practice.run({
                turns: [
                    cutOff([
                        rateLimitReading({
                            status: 'rejected',
                            resets_at: RESET,
                        }),
                    ]),
                ],
                clock: fakeClock({ start: START, crash_on_sleep: true }).clock,
            })
        ).rejects.toThrow('The engine died mid-wait.')

        const after = fakeClock({ start: '2026-09-24T00:00:00.000Z' })
        const { action } = await practice.run({
            turns: [testWriter, implementer, reviewer],
            clock: after.clock,
            resume: true,
        })
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(after.slept).toEqual([])
    }, 60_000)
})

describe('billing stops', () => {
    test('overage stops the run at once, and the stop sticks across restarts', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const time = fakeClock({ start: START })
        const { action, records } = await practice.run({
            turns: [
                cutOff([
                    rateLimitReading({
                        status: 'allowed',
                        is_using_overage: true,
                    }),
                ]),
            ],
            clock: time.clock,
        })

        expect(action).toEqual({
            type: 'done',
            outcome: 'stopped',
            reason: 'rate_limit_event isUsingOverage=true (five_hour)',
        })
        expect(records.at(-1)).toMatchObject({
            kind: 'run_stopped',
            content: { billing: true },
        })
        expect(time.slept).toEqual([])

        const again = await practice.run({
            turns: [testWriter, implementer, reviewer],
            clock: time.clock,
            resume: true,
        })
        expect(again.action).toMatchObject({ outcome: 'stopped' })
        expect(again.launches).toEqual([])
    }, 60_000)

    test('a plan cut-off with no sign in its session stops the run, unsure', async () => {
        await expect(
            practice.run({
                turns: [cutOff([rateLimitReading({ status: 'allowed' })])],
                clock: fakeClock({ start: START }).clock,
            })
        ).rejects.toThrow('Run stopped:')
        expect(practice.journal.read().at(-1)).toMatchObject({
            kind: 'run_stopped',
            content: { billing: false },
        })
    }, 60_000)
})
