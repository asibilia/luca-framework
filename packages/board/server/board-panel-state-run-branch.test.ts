import { afterEach, describe, expect, test } from 'bun:test'

import { harness, runWith, eventRows } from './board-panel-state-helpers'
import {
    dependenciesInstalled,
    gatesRun,
    joinClashed,
    pullRequestOpened,
    ticketRebased,
    testsSentBack,
    ticketStuck,
    ticketWorktreeCreated,
    wholeTicket,
    worktreesRemoved,
} from './testing/journal-fixtures'

/**
 * The board's panel state for a ticket's worktree and the run branch: the
 * engine's install in a new worktree, and a clash on joining. The helpers
 * are in `board-panel-state-helpers.ts`; the other topics are in the
 * `board-panel-state-*.test.ts` files beside this one.
 */

afterEach(async () => {
    await harness.cleanup()
})

describe("the engine's install in a new worktree", () => {
    test('a passing install is quiet: no row, and the ticket just starts', async () => {
        await runWith({
            entries: [
                dependenciesInstalled({ ok: true }),
                ticketWorktreeCreated({ ticket: 13 }),
                dependenciesInstalled({ ticket: 13, ok: true }),
            ],
        })

        expect(eventRows().at(-1)).toEqual({
            text: '#13: started.',
            tone: 'info',
        })
        expect(await harness.ticket({ number: 13 })).toMatchObject({
            stage: 'building',
            tried: [],
        })
    })

    test('a failed install makes the ticket stuck with its reason and what was tried', async () => {
        await runWith({
            entries: [
                dependenciesInstalled({ ok: true }),
                ticketWorktreeCreated({ ticket: 13 }),
                dependenciesInstalled({ ticket: 13, ok: false }),
                ticketStuck({
                    ticket: 13,
                    reason: 'install_failed',
                    detail: '`bun install --frozen-lockfile` failed',
                }),
            ],
        })

        expect(eventRows().slice(-2)).toEqual([
            {
                text: '#13: the install failed: `bun install --frozen-lockfile`.',
                tone: 'danger',
            },
            expect.objectContaining({ tone: 'danger' }),
        ])
        const state = await harness.state()
        expect(state.needs_you[0]).toMatchObject({
            ticket: 13,
            reason: 'Installing the dependencies failed.',
            tried: ['The install failed: `bun install --frozen-lockfile`'],
        })
    })

    test("a failed install in the run branch's checkout gets its own row", async () => {
        await runWith({ entries: [dependenciesInstalled({ ok: false })] })

        expect(eventRows().at(-1)).toEqual({
            text: "The run branch's install failed: `bun install --frozen-lockfile`.",
            tone: 'danger',
        })
    })
})

describe('many tickets: a clash on the run branch', () => {
    /** Ticket 13 up to its approving review. */
    const approved13 = () => wholeTicket({ ticket: 13 }).slice(0, 17)

    test('a clash sends the ticket back to building, saying where it clashed', async () => {
        await runWith({
            entries: [
                ...approved13(),
                joinClashed({ ticket: 13 }),
                ticketRebased({
                    ticket: 13,
                    cause: 'clash',
                    code: ['src/index.ts'],
                }),
            ],
        })

        const card = await harness.ticket({ number: 13 })
        expect(card).toMatchObject({
            step: 2,
            role: null,
            fix_round: 0,
            review_fix_round: 0,
            findings: null,
            activity: 'fixing on the run branch',
        })
        expect(card?.tried.at(-1)).toBe(
            'Clashed with the run branch in src/index.ts'
        )
        expect(eventRows().slice(-2)).toEqual([
            {
                text: "#13: couldn't join the run branch: CONFLICT (content): src/index.ts",
                tone: 'danger',
            },
            {
                text: '#13: clashed with the run branch in src/index.ts.',
                tone: 'warning',
            },
        ])
    })

    test('clashed tests send it back to its tests', async () => {
        await runWith({
            entries: [
                ...approved13(),
                joinClashed({ ticket: 13 }),
                ticketRebased({
                    ticket: 13,
                    cause: 'clash',
                    tests: ['src/menu.test.ts'],
                }),
            ],
        })

        expect(await harness.ticket({ number: 13 })).toMatchObject({
            step: 0,
        })
    })

    test('a test the joined tickets made wrong goes back to the test-writer, saying which', async () => {
        await runWith({
            entries: [
                ...approved13(),
                joinClashed({ ticket: 13 }),
                ticketRebased({
                    ticket: 13,
                    cause: 'clash',
                    code: ['src/index.ts'],
                }),
                testsSentBack({ ticket: 13, joined: [11] }),
            ],
        })

        const card = await harness.ticket({ number: 13 })
        expect(card).toMatchObject({
            step: 0,
            role: null,
            activity: 'updating tests for the run branch',
        })
        expect(card?.tried.at(-1)).toBe(
            'Test update 1: src/menu.test.ts > menu > lists three items is wrong on the run branch after #11 joined; back to the test-writer'
        )
        expect(eventRows().at(-1)).toEqual({
            text: '#13: test update 1: src/menu.test.ts > menu > lists three items is wrong on the run branch after #11 joined; back to the test-writer.',
            tone: 'warning',
        })
    })

    test('checks failing after joining take a joined ticket back to building', async () => {
        await runWith({
            entries: [
                ...wholeTicket({ ticket: 13 }).slice(0, 18),
                gatesRun({ ticket: 13, ok: false, target: 'run_branch' }),
                ticketRebased({ ticket: 13, cause: 'join_gates' }),
            ],
        })

        const card = await harness.ticket({ number: 13 })
        expect(card).toMatchObject({
            activity: 'fixing on the run branch',
        })
        expect(card?.tried.at(-1)).toBe(
            'The checks failed after joining; fixing on top of the run branch'
        )
        expect(eventRows().at(-1)).toEqual({
            text: '#13: the checks failed after joining; fixing on top of the run branch.',
            tone: 'warning',
        })
    })

    test('removing the worktrees at the end changes nothing and adds no row', async () => {
        const { run_id, token, next } = await runWith({
            entries: [
                ...wholeTicket({ ticket: 13 }),
                pullRequestOpened({
                    number: 7,
                    url: 'https://github.com/acme/app/pull/7',
                }),
            ],
        })
        const before = await harness.state()
        const eventsBefore = eventRows().length

        await harness.send({
            run_id,
            token,
            first_seq: next,
            entries: [worktreesRemoved({ paths: ['/runs/1/tickets/13'] })],
        })

        const after = await harness.state()
        expect(after.tickets).toEqual(before.tickets)
        expect(after.run.status).toBe('done')
        expect(after.latest).toBe(before.latest)
        expect(eventRows()).toHaveLength(eventsBefore)
    })
})
