import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { Journal } from '../journal/journal'
import { replayRun, type RunState } from '../journal/replay'
import type { EngineClock } from '../limits/limit-wait'
import { SPEC_OWNER, specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    git,
    happyTurns,
    IMPLEMENTER_RESULT,
    SUM,
} from '../testing/practice-repo'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'

/**
 * Seam 2 for stuck work (#366): whole runs on the practice repo with
 * scripted agents and the in-memory tracker, where a ticket gets stuck, the
 * spec issue hears of it, and a scripted person replies on the tracker
 * while the engine waits. No GitHub, no models.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-stuck-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const WRONG_SUM = 'export const sum = (): number => 42\n'

const SUM_TICKET = ticketIssue({
    number: 11,
    title: 'Add sum',
    criteria: ['sum adds two numbers', 'sum of no numbers is zero'],
})

/**
 * A tracker with spec #10 (owned by `SPEC_OWNER`) and these tickets. The
 * engine's own comments are posted as the owner too, as on GitHub, where
 * `gh` runs as the user.
 */
const trackerWith = (tickets: ReturnType<typeof ticketIssue>[]) =>
    createInMemoryTracker({
        issues: [specIssue({ number: 10 }), ...tickets],
        sub_tickets: { 10: tickets.map(({ number }) => number) },
        engine_login: SPEC_OWNER,
    })

/**
 * A clock whose every wait lets a scripted person act once `when` holds for
 * the run's state: `act` runs at most once. Waits yield briefly for real, so
 * tickets building meanwhile make progress.
 */
const personClock = ({
    journal,
    when,
    act,
}: {
    journal: Journal
    when: (state: RunState) => boolean
    act: (state: RunState) => Promise<void> | void
}): EngineClock & { acted: () => boolean } => {
    let acted = false
    return {
        now: () => Date.now(),
        sleep: async () => {
            await Bun.sleep(5)
            if (acted) return
            const state = replayRun({ records: journal.read() })
            if (!when(state)) return
            acted = true
            await act(state)
        },
        acted: () => acted,
    }
}

const worktreeOf = (state: RunState, ticket: number): string =>
    state.tickets[ticket]?.worktree?.path ?? ''

describe('stuck work reaches the spec owner, end to end', () => {
    test('retry resumes with a fresh agent and fresh counts, and keeps the owner’s code edits; others’ comments are ignored', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = trackerWith([SUM_TICKET])
        const { testWriter, reviewer } = happyTurns()
        const wrong: ScriptedTurn = {
            role: 'implementer',
            ticket: 11,
            files: {
                'src/sum.ts': WRONG_SUM,
                'src/index.ts': "export { sum } from './sum'\n",
            },
            result: IMPLEMENTER_RESULT,
        }
        const clock = personClock({
            journal: practice.journal,
            when: (state) => (state.tickets[11]?.stuck_report ?? null) !== null,
            act: async (state) => {
                await Bun.write(join(worktreeOf(state, 11), 'src/sum.ts'), SUM)
                tracker.addComment({
                    number: 10,
                    author: 'passer-by',
                    body: 'skip',
                })
                tracker.addComment({
                    number: 10,
                    author: SPEC_OWNER,
                    body: 'Retry',
                })
            },
        })

        const { action, records, launches } = await practice.run({
            tracker,
            clock,
            stop_before: [],
            turns: [
                testWriter,
                wrong,
                wrong,
                wrong,
                wrong,
                // The fresh implementer after the retry changes nothing:
                // the owner's fix is already in the worktree.
                { role: 'implementer', ticket: 11, result: IMPLEMENTER_RESULT },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [report, ...rest] = tracker.commentsOn({ number: 10 })
        expect(report).toContain('Ticket #11 is stuck: Add sum')
        expect(report).toContain('Why: The checks still fail.')
        expect(report).toContain('Tried: 3 fix rounds on the checks.')
        expect(report).toContain('Suggestion:')
        expect(report).toContain('`retry #11`')
        // The passer-by's comment and the owner's, nothing from the engine.
        expect(rest).toEqual(['skip', 'Retry'])

        const replies = records.filter(
            (record) => record.kind === 'reply_received'
        )
        expect(replies.map(({ content }) => content)).toEqual([
            {
                word: 'retry',
                ticket: 11,
                comment_id: expect.any(Number),
                author: SPEC_OWNER,
            },
        ])
        expect(
            records.some(
                (record) =>
                    record.kind === 'ticket_retried' &&
                    record.content.mode === 'resume'
            )
        ).toBe(true)

        const implementerCalls = launches.filter(
            ({ role }) => role === 'implementer'
        )
        expect(implementerCalls.map(({ kind }) => kind)).toEqual([
            'launch',
            'follow_up',
            'follow_up',
            'follow_up',
            'launch',
        ])
        expect(implementerCalls.at(-1)?.prompt).toContain(
            'This ticket was retried'
        )
        const runBranch = replayRun({ records }).run_branch?.branch ?? ''
        expect(
            await git(practice.origin, 'show', `${runBranch}:src/sum.ts`)
        ).toBe(SUM)
    }, 60_000)

    test('retry after the owner edits the ticket starts it over from the new copy', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = trackerWith([SUM_TICKET])
        const clock = personClock({
            journal: practice.journal,
            when: (state) => (state.tickets[11]?.stuck_report ?? null) !== null,
            act: () => {
                tracker.updateIssue({
                    number: 11,
                    changes: {
                        labels: ['ready-for-agent', 'refactor'],
                    },
                })
                tracker.addComment({
                    number: 10,
                    author: SPEC_OWNER,
                    body: 'retry #11',
                })
            },
        })
        const { implementer, reviewer } = happyTurns()

        const { action, records, launches } = await practice.run({
            tracker,
            clock,
            stop_before: [],
            turns: [
                {
                    role: 'test-writer',
                    ticket: 11,
                    result: {
                        outcome: 'nothing_new_to_test',
                        summary: 'It only moves code.',
                    },
                },
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(tracker.commentsOn({ number: 10 })[0]).toContain(
            'add the `refactor` label'
        )
        const snapshots = records.filter(
            (record) =>
                record.kind === 'ticket_snapshot' && record.ticket === 11
        )
        expect(
            snapshots.map((record) =>
                record.kind === 'ticket_snapshot' ? record.content.labels : []
            )
        ).toEqual([['ready-for-agent'], ['ready-for-agent', 'refactor']])
        expect(
            records.some(
                (record) =>
                    record.kind === 'ticket_retried' &&
                    record.content.mode === 'restart'
            )
        ).toBe(true)
        // Started over as a refactor ticket: no second test-writer.
        expect(
            launches
                .map(({ role }) => role)
                .filter((role) => !role.endsWith('-lens'))
        ).toEqual(['test-writer', 'implementer', 'ticket-reviewer'])
        expect(launches[1]?.may_edit_tests).toBe(true)
    }, 60_000)

    test('while one ticket is stuck the others keep building; skip leaves it and its dependents out, and the rest ships', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = trackerWith([
            SUM_TICKET,
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
        const clock = personClock({
            journal: practice.journal,
            // The owner answers only once #11 has pushed without them.
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

        const { action, records, launches } = await practice.run({
            tracker,
            clock,
            stop_before: [],
            turns: [
                ...Object.values(happyTurns()),
                {
                    role: 'test-writer',
                    ticket: 12,
                    result: {
                        outcome: 'nothing_new_to_test',
                        summary: 'Nothing to test.',
                    },
                },
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const state = replayRun({ records })
        expect(state.tickets[11]?.pushed).not.toBeNull()
        expect(state.tickets[12]?.skipped).toEqual({ because: null })
        expect(state.tickets[13]?.skipped).toEqual({ because: 12 })
        expect(state.tickets[13]?.worktree ?? null).toBeNull()
        expect(tracker.commentsOn({ number: 12 })).toEqual([
            expect.stringContaining('replied `skip`'),
        ])
        expect(tracker.commentsOn({ number: 13 })).toEqual([
            expect.stringContaining('it waits on #12, which was skipped'),
        ])
        const [pull] = tracker.pullRequests()
        expect(pull?.body).toContain('Closes #11')
        expect(pull?.body).not.toContain('Closes #12')
        expect(pull?.body).not.toContain('Closes #13')
        expect(pull?.body).toContain('## Skipped tickets')
        expect(pull?.body).toContain('#13 Add average: waits on #12')
        expect(launches.filter(({ ticket }) => ticket === 13)).toEqual([])
    }, 60_000)

    test('stop ends the run without a PR and keeps the branch', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = trackerWith([SUM_TICKET])
        const clock = personClock({
            journal: practice.journal,
            when: (state) => (state.tickets[11]?.stuck_report ?? null) !== null,
            act: () => {
                tracker.addComment({
                    number: 10,
                    author: SPEC_OWNER,
                    body: 'stop',
                })
            },
        })

        const { action, records } = await practice.run({
            tracker,
            clock,
            stop_before: [],
            turns: [
                {
                    role: 'test-writer',
                    ticket: 11,
                    result: { outcome: 'nothing_new_to_test' },
                },
            ],
        })

        expect(action).toEqual({ type: 'done', outcome: 'stopped_by_user' })
        expect(tracker.pullRequests()).toEqual([])
        const state = replayRun({ records })
        const branch = state.run_branch?.branch ?? ''
        expect(
            (await git(practice.repo, 'branch', '--list', branch)).trim()
        ).toContain(branch)
        expect(existsSync(worktreeOf(state, 11))).toBe(true)
    }, 60_000)

    test('a ticket that needs a test setup file changed is stuck with a clear message', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker: InMemoryTracker = trackerWith([SUM_TICKET])
        const { testWriter } = happyTurns()

        const { action, records } = await practice.run({
            tracker,
            turns: [
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
            ],
        })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(
            records.find((record) => record.kind === 'ticket_stuck')?.content
        ).toMatchObject({ reason: 'setup_change_needed' })
        const [report] = tracker.commentsOn({ number: 10 })
        expect(report).toContain(
            'An agent needs a test setup file changed, and only you may change one.'
        )
        expect(report).toContain(
            'The implementer needs the test setup file `test/setup.ts` changed: The tests need a fake clock installed first.'
        )
        expect(report).toContain('Make that change yourself in the worktree')
    }, 60_000)
})
