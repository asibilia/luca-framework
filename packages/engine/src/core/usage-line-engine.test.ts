import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runEngine } from './execute'

import { createJournal, type Journal } from '../journal/journal'
import type { EngineClock } from '../limits/limit-wait'
import type { UsageLineDeps, WindowReading } from '../limits/usage-line'
import {
    agentSession,
    epochSeconds,
    intakePassed,
    practiceTicket,
    runBranchCreated,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import { practiceTracker } from '../testing/practice-repo'
import type { InMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * `runEngine` with a usage line (#434): before each decision it shares the
 * run's own readings, reads the `luca-board` lines and the readings every
 * run shared, and pauses at a line before the next agent turn. A fake
 * `UsageLineDeps` stands for the files; the run stops before any agent is
 * launched, so a missed pause shows as a `launch_agent`.
 */

const START = '2026-01-01T00:00:00.000Z'
const WEEKLY_RESET = '2026-01-04T11:00:00.000Z'

const LINES = { weekly_line: 80, five_hour_line: 85 }

/** `n` minutes after the start, in ms. */
const minute = (n: number): number => Date.parse(START) + n * 60_000

/** A weekly reading as the launcher journals it and runs share it. */
const weeklyReading = ({
    fill,
    arrived_at,
}: {
    fill: number
    arrived_at: number
}): Record<string, unknown> => ({
    status: 'allowed',
    rateLimitType: 'seven_day',
    isUsingOverage: false,
    overageStatus: 'rejected',
    unifiedWindows: {
        seven_day: { utilization: fill, resetsAt: epochSeconds(WEEKLY_RESET) },
    },
    arrived_at: new Date(arrived_at).toISOString(),
})

let root = ''
let journal: Journal
let tracker: InMemoryTracker

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-usage-engine-'))
    journal = createJournal({ file: join(root, 'run-1', 'journal.jsonl') })
    tracker = practiceTracker()
    // Ticket #11's test-writer is done, with the run's own weekly reading
    // at 50%; its implementer is next.
    const entries = [
        ...intakePassed({ tickets: [practiceTicket({ number: 11 })] }),
        ...withInstalls({
            entries: [
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 3),
                agentSession({
                    ticket: 11,
                    role: 'test-writer',
                    rate_limit_events: [
                        weeklyReading({ fill: 0.5, arrived_at: minute(1) }),
                    ],
                }),
                ...ticketBuilt({ ticket: 11 }).slice(3, 6),
            ],
        }),
    ]
    for (const entry of entries) journal.append(entry)
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** A clock that starts at `START` and moves only when slept. */
const fakeClock = (): EngineClock => {
    let now = Date.parse(START)
    return {
        now: () => now,
        sleep: async (ms) => {
            now += ms
        },
    }
}

/** A fake usage line that logs its calls and what the run shared. */
const fakeUsage = ({ shared }: { shared: Record<string, unknown>[] }) => {
    const calls: string[] = []
    const sharedByRun: WindowReading[][] = []
    const usage: UsageLineDeps = {
        read_lines: async () => {
            calls.push('read_lines')
            return LINES
        },
        read_shared: async () => {
            calls.push('read_shared')
            return shared
        },
        share: async (readings) => {
            calls.push('share')
            sharedByRun.push(readings)
        },
    }
    return { usage, calls, sharedByRun }
}

const run = (usage?: UsageLineDeps) =>
    runEngine({
        journal,
        tracker,
        usage,
        clock: fakeClock(),
        stop_before: ['launch_agent', 'wait_for_usage_line'],
    })

const kinds = () => journal.read().map(({ kind }) => kind)

describe('runEngine: the usage line', () => {
    test('with no usage line, the implementer is launched next', async () => {
        expect(await run()).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'implementer',
        })
        expect(kinds()).not.toContain('usage_line_wait_started')
    })

    test('a shared reading at the weekly line journals usage_line_wait_started before the next agent turn', async () => {
        const before = journal.read().length
        const fake = fakeUsage({
            shared: [weeklyReading({ fill: 0.82, arrived_at: minute(5) })],
        })

        const action = await run(fake.usage)

        expect(action).toMatchObject({ type: 'wait_for_usage_line' })
        const added = journal.read().slice(before)
        const started = added.find(
            ({ kind }) => kind === 'usage_line_wait_started'
        )
        expect(started).toMatchObject({
            content: {
                window: 'seven_day',
                line: 80,
                percent: 82,
                resets_at: WEEKLY_RESET,
            },
        })
        expect(added.map(({ kind }) => kind)).not.toContain('agent_started')
        expect(added.map(({ kind }) => kind)).not.toContain('agent_session')
        const comments = tracker.commentsOn({ number: 10 })
        expect(comments).toHaveLength(1)
        expect(comments[0]).toContain('usage line')
    })

    test('before deciding, the run shares its own readings, then reads the lines and the shared readings', async () => {
        const fake = fakeUsage({
            shared: [weeklyReading({ fill: 0.82, arrived_at: minute(5) })],
        })

        await run(fake.usage)

        expect(fake.calls[0]).toBe('share')
        expect(fake.calls.slice(1, 3).sort()).toEqual([
            'read_lines',
            'read_shared',
        ])
        expect(fake.sharedByRun[0]).toContainEqual({
            window: 'seven_day',
            percent: 50,
            resets_at: epochSeconds(WEEKLY_RESET),
            arrival: minute(1),
        })
    })

    test('under the lines, the run shares its readings and launches the implementer as before', async () => {
        const fake = fakeUsage({
            shared: [weeklyReading({ fill: 0.79, arrived_at: minute(5) })],
        })

        expect(await run(fake.usage)).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'implementer',
        })
        expect(fake.calls).toContain('share')
        expect(kinds()).not.toContain('usage_line_wait_started')
        expect(tracker.commentsOn({ number: 10 })).toHaveLength(0)
    })
})
