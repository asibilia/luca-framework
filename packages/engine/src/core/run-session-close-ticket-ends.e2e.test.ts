import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { MAX_FIX_ROUNDS } from './loop-caps'
import {
    expectEveryoneClosed,
    launchedBy,
    PASSING_SUM_TEST,
    scriptedWith,
    wrongImplementer,
} from './run-session-close-helpers'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { Journal } from '../journal/journal'
import { replayRun, type RunState } from '../journal/replay'
import type { EngineClock } from '../limits/limit-wait'
import { SPEC_OWNER, specIssue, ticketIssue } from '../testing/intake-fixtures'
import { createPracticeRepo, happyTurns } from '../testing/practice-repo'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Seam 2 for closing finished agents' sessions (#409), a ticket that ends
 * early: stuck, skipped, or stopped by the owner. The clean run and the fix
 * rounds are in `run-session-close.e2e.test.ts`, the interruptions in
 * `run-session-close-interruptions.e2e.test.ts`, and the helpers they share
 * are in `run-session-close-helpers.ts`.
 */

let root = ''

/** A fresh `root` for each test of the describe it is called in. */
const rootPerTest = () => {
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-session-close-'))
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })
}

/** Spec #10, owned by `SPEC_OWNER`, with these tickets. */
const trackerWith = (tickets: ReturnType<typeof ticketIssue>[]) =>
    createInMemoryTracker({
        issues: [specIssue({ number: 10 }), ...tickets],
        sub_tickets: { 10: tickets.map(({ number }) => number) },
        engine_login: SPEC_OWNER,
    })

const SUM_CRITERIA = ['sum adds two numbers', 'sum of no numbers is zero']

/**
 * A clock whose every wait lets the spec owner act once `when` holds for
 * the run's state. Waits yield briefly for real, so tickets building
 * meanwhile make progress.
 */
const ownerClock = ({
    journal,
    when,
    act,
}: {
    journal: Journal
    when: (state: RunState) => boolean
    act: () => void
}): EngineClock => {
    let acted = false
    return {
        now: () => Date.now(),
        sleep: async () => {
            await Bun.sleep(5)
            if (acted) return
            if (!when(replayRun({ records: journal.read() }))) return
            acted = true
            act()
        },
    }
}

describe('sessions close on every other way a step ends, end to end', () => {
    rootPerTest()

    test('a stuck ticket leaves none of its sessions open while it waits for a reply', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter } = happyTurns()
        const launcher = scriptedWith([
            testWriter,
            {
                role: 'implementer',
                ticket: 11,
                result: {
                    outcome: 'needs_setup_change',
                    setup_change: {
                        file: 'test/setup.ts',
                        reason: 'The tests need a fake clock installed first.',
                    },
                },
            },
        ])

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(
            records.some(
                (record) =>
                    record.kind === 'ticket_stuck' &&
                    record.content.reason === 'setup_change_needed'
            )
        ).toBe(true)
        expect(launchedBy(launcher).map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
        ])
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test("a ticket stuck in its red-check fix loop closes its test-writer's session", async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter } = happyTurns()
        const passingAlready: ScriptedTurn = {
            ...testWriter,
            files: { 'src/sum.test.ts': PASSING_SUM_TEST },
        }
        const launcher = scriptedWith(
            Array.from({ length: MAX_FIX_ROUNDS + 1 }, () => passingAlready)
        )

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(
            records.some(
                (record) =>
                    record.kind === 'ticket_stuck' &&
                    record.content.reason === 'red_check_failed'
            )
        ).toBe(true)
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test('a skipped ticket and its dependents leave no session open, and the rest ships', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = trackerWith([
            ticketIssue({
                number: 11,
                title: 'Add sum',
                criteria: SUM_CRITERIA,
            }),
            ticketIssue({
                number: 12,
                title: 'Add product',
                criteria: ['product multiplies'],
            }),
            ticketIssue({
                number: 13,
                title: 'Add average',
                criteria: ['average of the numbers'],
                blocked_by: [12],
            }),
        ])
        const launcher = scriptedWith([
            ...Object.values(happyTurns()),
            {
                role: 'test-writer',
                ticket: 12,
                result: {
                    outcome: 'nothing_new_to_test',
                    summary: 'Nothing to test.',
                },
            },
        ])
        const clock = ownerClock({
            journal: practice.journal,
            when: (state) =>
                (state.tickets[12]?.stuck_report ?? null) !== null &&
                (state.tickets[11]?.pushed ?? null) !== null,
            act: () => {
                tracker.addComment({
                    number: 10,
                    author: SPEC_OWNER,
                    body: 'skip #12',
                })
            },
        })

        const { action, records } = await practice.run({
            launcher,
            tracker,
            clock,
            stop_before: [],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(replayRun({ records }).tickets[12]?.skipped).toEqual({
            because: null,
        })
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test("the owner's stop closes the sessions of a ticket still in its fix loop", async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = trackerWith([
            ticketIssue({
                number: 11,
                title: 'Add sum',
                criteria: SUM_CRITERIA,
            }),
            ticketIssue({
                number: 12,
                title: 'Add sum again',
                criteria: SUM_CRITERIA,
            }),
        ])
        const { testWriter } = happyTurns()
        const launcher = scriptedWith([
            {
                role: 'test-writer',
                ticket: 11,
                result: { outcome: 'nothing_new_to_test' },
            },
            { ...testWriter, ticket: 12 },
            // #12's gates keep failing, so its implementer stays in its loop.
            ...Array.from({ length: MAX_FIX_ROUNDS + 1 }, () =>
                wrongImplementer(12)
            ),
        ])
        const clock = ownerClock({
            journal: practice.journal,
            when: (state) =>
                (state.tickets[11]?.stuck_report ?? null) !== null &&
                (state.tickets[12]?.implementer ?? null) !== null,
            act: () => {
                tracker.addComment({
                    number: 10,
                    author: SPEC_OWNER,
                    body: 'stop',
                })
            },
        })

        const { action, records } = await practice.run({
            launcher,
            tracker,
            clock,
            stop_before: [],
        })

        expect(action).toEqual({ type: 'done', outcome: 'stopped_by_user' })
        expect(
            launchedBy(launcher).some(
                ({ role, session_id }) =>
                    role === 'implementer' && session_id.includes('-12-')
            )
        ).toBe(true)
        expectEveryoneClosed({ launcher, records })
    }, 90_000)
})
