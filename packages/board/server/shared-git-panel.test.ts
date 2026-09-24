import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentFinished,
    agentStarted,
    intakeOfThree,
    runStopped,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

/**
 * Seam 3 for outside changes to the shared `.git` (#400): the engine's
 * `shared_git_changed` record is counted quietly on the panel, never shown
 * as stuck work or an agent's failure.
 */

let harness: Harness

afterEach(async () => {
    await harness.cleanup()
})

const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    const reply = await harness.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
    return { run_id, token, next: reply.next_seq }
}

/** The record the engine journals after a turn, shaped like the engine's. */
const sharedGitChanged = ({
    ticket,
    role,
    changes,
}: {
    ticket: number
    role: string
    changes: string[]
}): Entry => ({
    kind: 'shared_git_changed',
    ticket,
    role,
    content: { role, changes },
})

describe('outside changes to the shared .git on the board', () => {
    test('a board with no outside changes counts none', async () => {
        await runWith({ entries: [] })

        expect((await harness.state()).shared_git_changed).toBe(0)
    })

    test('outside changes are counted quietly, never as stuck work or a failed try', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentStarted({ ticket: 11, role: 'test-writer' }),
            ],
        })
        const before = await harness.state()
        const rowsBefore = harness.latestRows().length

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                sharedGitChanged({
                    ticket: 11,
                    role: 'test-writer',
                    changes: ['the shared .git/config changed'],
                }),
                sharedGitChanged({
                    ticket: 11,
                    role: 'test-writer',
                    changes: [
                        'the shared .git/config changed',
                        'the shared .git/hooks changed',
                    ],
                }),
            ],
        })

        const after = await harness.state()
        expect(after.shared_git_changed).toBe(2)
        expect(after.needs_you).toEqual([])
        expect(after.tickets).toEqual(before.tickets)
        expect(after.run.status).toBe(before.run.status)
        expect(after.run.phase).toBe(before.run.phase)
        expect(harness.logs.join('\n')).not.toContain('shared_git_changed')
        const added = harness.latestRows().slice(rowsBefore)
        for (const { row } of added) {
            expect(['luca-board-run', 'luca-board-event']).toContain(row.kind)
            if (row.kind === 'luca-board-event') {
                expect(row.data.tone).toBe('info')
            }
        }
    })

    test("the agent's turn still finishes as its own after outside changes", async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentStarted({ ticket: 11, role: 'test-writer' }),
                sharedGitChanged({
                    ticket: 11,
                    role: 'test-writer',
                    changes: ['the shared .git/info/exclude changed'],
                }),
                agentFinished({ ticket: 11, role: 'test-writer' }),
            ],
        })

        const state = await harness.state()
        expect(state.shared_git_changed).toBe(1)
        expect(state.needs_you).toEqual([])
        const card = await harness.ticket({ number: 11 })
        expect(card.failed_turn).toBeNull()
        expect(card.stage).not.toBe('stuck')
        expect(card.tried).toEqual([])
    })

    test('an outside change does not count as the engine moving on after a stop', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                agentStarted({ ticket: 11, role: 'test-writer' }),
                runStopped({
                    ticket: 11,
                    role: 'test-writer',
                    reason: 'overage',
                }),
            ],
        })

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [
                sharedGitChanged({
                    ticket: 11,
                    role: 'test-writer',
                    changes: ['the shared .git/config changed'],
                }),
            ],
        })

        const state = await harness.state()
        expect(state.shared_git_changed).toBe(1)
        expect(state.run.status).toBe('stopped')
        expect(state.run.stopped).not.toBeNull()
    })
})
