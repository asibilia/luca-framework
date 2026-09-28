import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import { replayRun } from '../journal/replay'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import { createPracticeRepo, happyTurns } from '../testing/practice-repo'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'

/**
 * Seam 2 for a ticket whose work is already on the base branch (#484):
 * whole runs on the practice repo with scripted agents and the in-memory
 * tracker. The test-writer answers `already_done` with its evidence; the
 * ticket is done, not stuck, and nobody has to reply.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-already-done-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const SHA = '3559c25f5a1b2c3d4e5f60718293a4b5c6d7e8f9'

/** A test-writer that finds ticket `ticket`'s work already on `main`. */
const alreadyDoneTurn = (ticket: number): ScriptedTurn => ({
    role: 'test-writer',
    ticket,
    result: {
        outcome: 'already_done',
        done_by: [{ sha: SHA, title: 'feat: add sum (#482)' }],
        criteria: [
            {
                criterion_id: 'AC1',
                tests: [{ file: 'src/sum.test.ts', name: 'sum > adds' }],
            },
            {
                criterion_id: 'AC2',
                tests: [{ file: 'src/sum.test.ts', name: 'sum > of none' }],
            },
        ],
        summary: 'PR #482 already added the sum and its tests.',
    },
})

const SUM_TICKET = ticketIssue({
    number: 11,
    title: 'Add sum',
    criteria: ['sum adds two numbers', 'sum of no numbers is zero'],
})

describe('a ticket whose work is already done', () => {
    test('when every ticket is already done, the run ends with nothing to do, and closes the ticket with a comment', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = createInMemoryTracker({
            issues: [specIssue({ number: 10 }), SUM_TICKET],
            sub_tickets: { 10: [11] },
        })

        const { action, records, launches } = await practice.run({
            tracker,
            turns: [alreadyDoneTurn(11)],
        })

        expect(action).toEqual({ type: 'done', outcome: 'nothing_to_do' })
        expect(records.some(({ kind }) => kind === 'ticket_stuck')).toBe(false)
        expect(launches.map(({ role }) => role)).toEqual(['test-writer'])
        expect(tracker.pullRequests()).toEqual([])
        expect((await tracker.readIssue({ number: 11 }))?.state).toBe('closed')
        const [closing] = tracker.commentsOn({ number: 11 })
        expect(closing).toContain('already on `main`')
        expect(closing).toContain('3559c25')
        const [told] = tracker.commentsOn({ number: 10 })
        expect(told).toContain('#11 is already done')
        expect(told).toContain('3559c25')
        const state = replayRun({ records })
        expect(state.phase).toBe('nothing_to_do')
        expect(state.tickets[11]?.already_done).toEqual({ shas: [SHA] })
        expect(state.removed_worktrees).toContain(state.run_branch?.path ?? '')
    }, 60_000)

    test('in a mixed run, the ticket that waits on it builds, the PR closes it as already done, and names the open tickets not in the run', async () => {
        const practice = await createPracticeRepo({ root })
        const product = ticketIssue({
            number: 12,
            title: 'Add product',
            criteria: ['product adds two numbers', 'product of none is zero'],
            blocked_by_section: '- #11',
            blocked_by: [11],
        })
        const reopened = ticketIssue({ number: 13, title: 'Add the menu item' })
        const closed = ticketIssue({
            number: 14,
            title: 'Rename the module',
            state: 'closed',
        })
        const inner = createInMemoryTracker({
            issues: [
                specIssue({ number: 10 }),
                SUM_TICKET,
                product,
                reopened,
                closed,
            ],
            sub_tickets: { 10: [11, 12, 13, 14] },
        })
        // At intake #13 was closed (so the run left it out); it was
        // reopened while the run went.
        let reads = 0
        const tracker: InMemoryTracker = {
            ...inner,
            listSubTickets: async (args) => {
                reads += 1
                const tickets = await inner.listSubTickets(args)
                return reads === 1
                    ? tickets.map((ticket) =>
                          ticket.number === 13
                              ? { ...ticket, state: 'closed' }
                              : ticket
                      )
                    : tickets
            },
        }
        const turns = Object.values(happyTurns()).map((turn) => ({
            ...turn,
            ticket: 12,
        }))

        const { action, records, launches } = await practice.run({
            tracker,
            turns: [alreadyDoneTurn(11), ...turns],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(records.some(({ kind }) => kind === 'ticket_stuck')).toBe(false)
        expect(
            launches
                .filter(({ role }) => !role.endsWith('-lens'))
                .map(({ role, ticket }) => `${role} #${ticket}`)
        ).toEqual([
            'test-writer #11',
            'test-writer #12',
            'implementer #12',
            'ticket-reviewer #12',
        ])
        const [pull] = tracker.pullRequests()
        expect(pull?.body).toContain(
            '- Closes #11: Add sum (already done before this run, by 3559c25)'
        )
        expect(pull?.body).toContain('- Closes #12: Add product')
        expect(pull?.body).toContain('## Not in this run')
        expect(pull?.body).toContain('- #13 Add the menu item')
        expect(pull?.body).not.toContain('#14')
        // The PR closes it on merge; the engine doesn't close it itself.
        expect((await tracker.readIssue({ number: 11 }))?.state).toBe('open')
        expect(tracker.commentsOn({ number: 11 })).toEqual([])
    }, 60_000)
})
