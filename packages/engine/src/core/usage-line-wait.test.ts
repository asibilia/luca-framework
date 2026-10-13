import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { decide } from './decide'
import { executeAction } from './execute'

import { createJournal, type Journal } from '../journal/journal'
import type { EngineClock } from '../limits/limit-wait'
import {
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
 * A usage-line wait from the decision step through the executor (#434): the
 * spec hears when the run pauses and when it carries on; the wait lasts
 * until the window resets, or ends at the next nap once a line is raised
 * above the reading (`read_usage_lines` re-reads the `luca-board`
 * settings). A fake clock, so nothing really waits.
 */

type Lines = { weekly_line: number; five_hour_line: number }

const LINES: Lines = { weekly_line: 80, five_hour_line: 85 }

const START = '2026-01-01T00:00:00.000Z'
const WEEKLY_RESET = '2026-01-04T11:00:00.000Z'
const UNTIL = '2026-01-04T11:01:00.000Z'

/** Another run's newest weekly reading: 82%, shared just after the start. */
const SHARED = [
    {
        status: 'allowed',
        rateLimitType: 'seven_day',
        isUsingOverage: false,
        overageStatus: 'rejected',
        unifiedWindows: {
            seven_day: {
                utilization: 0.82,
                resetsAt: epochSeconds(WEEKLY_RESET),
            },
        },
        arrived_at: '2026-01-01T00:05:00.000Z',
    },
]

let root = ''
let journal: Journal
let tracker: InMemoryTracker

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-usage-line-'))
    journal = createJournal({ file: join(root, 'run-1', 'journal.jsonl') })
    tracker = practiceTracker()
    const entries = [
        ...intakePassed({ tickets: [practiceTicket({ number: 11 })] }),
        ...withInstalls({
            entries: [
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 2),
            ],
        }),
    ]
    for (const entry of entries) journal.append(entry)
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** A clock that starts at `START` and moves only when slept. */
const fakeClock = () => {
    let now = Date.parse(START)
    const clock: EngineClock = {
        now: () => now,
        sleep: async (ms) => {
            now += ms
        },
    }
    return { clock, now: () => now }
}

const decideNow = (lines: Lines) =>
    decide({
        records: journal.read(),
        usage_lines: lines,
        shared_readings: SHARED,
    })

/** Decide with the default lines and carry the action out. */
const step = async ({
    clock,
    read_usage_lines,
}: {
    clock: EngineClock
    read_usage_lines: () => Promise<Lines>
}) => {
    const action = decideNow(LINES)
    expect(['start_usage_line_wait', 'wait_for_usage_line']).toContain(
        action.type
    )
    await executeAction({
        action,
        journal,
        tracker,
        clock,
        read_usage_lines,
    })
    return action
}

const specComments = () => tracker.commentsOn({ number: 10 })

describe('usage-line waits', () => {
    test('a pause is journaled and told to the spec issue, naming the window and the line', async () => {
        const time = fakeClock()
        const action = await step({
            clock: time.clock,
            read_usage_lines: async () => LINES,
        })

        expect(action).toMatchObject({ type: 'start_usage_line_wait' })
        expect(journal.read().at(-1)).toMatchObject({
            kind: 'usage_line_wait_started',
            content: {
                window: 'seven_day',
                line: 80,
                percent: 82,
                resets_at: WEEKLY_RESET,
                until: UNTIL,
            },
        })
        const comments = specComments()
        expect(comments).toHaveLength(1)
        expect(comments[0]).toContain('usage line')
        expect(comments[0]).toContain('weekly')
        expect(comments[0]).toContain('80%')
        expect(comments[0]).toContain(WEEKLY_RESET)
        expect(time.now()).toBe(Date.parse(START))
    })

    test('the wait lasts until the window resets, the spec hears the run carry on, and the old reading no longer pauses it', async () => {
        const time = fakeClock()
        await step({ clock: time.clock, read_usage_lines: async () => LINES })

        expect(decideNow(LINES)).toMatchObject({
            type: 'wait_for_usage_line',
            until: UNTIL,
        })
        await step({ clock: time.clock, read_usage_lines: async () => LINES })

        expect(new Date(time.now()).toISOString()).toBe(UNTIL)
        expect(journal.read().at(-1)).toMatchObject({
            kind: 'usage_line_wait_ended',
            content: { until: UNTIL, reason: 'reset' },
        })
        const comments = specComments()
        expect(comments).toHaveLength(2)
        expect(comments[1]).toContain('usage line')
        expect(decideNow(LINES)).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
        })
    })

    test('a line raised above the reading during the wait ends it at the next nap, long before the reset', async () => {
        const time = fakeClock()
        await step({ clock: time.clock, read_usage_lines: async () => LINES })

        const raisedAt = Date.parse(START) + 20 * 60_000
        const raised: Lines = { weekly_line: 90, five_hour_line: 85 }
        await step({
            clock: time.clock,
            read_usage_lines: async () =>
                time.now() >= raisedAt ? raised : LINES,
        })

        expect(time.now()).toBeGreaterThanOrEqual(raisedAt)
        expect(time.now()).toBeLessThanOrEqual(raisedAt + 5 * 60_000)
        expect(journal.read().at(-1)).toMatchObject({
            kind: 'usage_line_wait_ended',
            content: { reason: 'line_raised' },
        })
        expect(specComments()).toHaveLength(2)
        expect(decideNow(raised)).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
        })
    })

    test('a line raised only to the reading is not above it, so the wait goes on to the reset', async () => {
        const time = fakeClock()
        await step({ clock: time.clock, read_usage_lines: async () => LINES })

        await step({
            clock: time.clock,
            read_usage_lines: async () => ({
                weekly_line: 82,
                five_hour_line: 85,
            }),
        })

        expect(new Date(time.now()).toISOString()).toBe(UNTIL)
        expect(journal.read().at(-1)).toMatchObject({
            kind: 'usage_line_wait_ended',
            content: { reason: 'reset' },
        })
    })
})

describe('the engine README', () => {
    test('has a "The usage line" section about the two lines and their defaults', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()
        const start = readme.indexOf('\n## The usage line')
        expect(start).toBeGreaterThan(-1)
        const rest = readme.slice(start + 1)
        const next = rest.indexOf('\n## ')
        const section = next === -1 ? rest : rest.slice(0, next)
        expect(section).toContain('weekly_line')
        expect(section).toContain('five_hour_line')
        expect(section).toContain('80')
        expect(section).toContain('85')
        expect(section).toContain('luca-board')
    })
})
