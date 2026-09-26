import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentSession,
    intakeOfThree,
    replyReceived,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

/**
 * The run budget on the board (#435), at `board.read`: the run's exact
 * tokens against its budget, the run stuck on its budget waiting for the
 * owner's `retry` or `stop`, and a `retry` adding one more full budget.
 */

let harness: Harness | null = null

afterEach(async () => {
    await harness?.cleanup()
    harness = null
})

/** Intake of three tickets, its config's run budget set to `budget` if given. */
const intakeWithBudget = ({ budget }: { budget?: number }): Entry[] =>
    intakeOfThree().map((entry) => {
        if (entry.kind !== 'run_started' || budget === undefined) return entry
        const content = entry.content as { config: object }
        return {
            ...entry,
            content: {
                ...content,
                config: { ...content.config, run_budget_tokens: budget },
            },
        }
    })

/** Starts a run and sends intake plus `entries` in one go. */
const runWith = async ({
    budget,
    entries,
}: {
    budget?: number
    entries: Entry[]
}) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    await harness.send({
        run_id,
        token,
        entries: [...intakeWithBudget({ budget }), ...entries],
    })
    return { board: harness, run_id, token }
}

const BUDGET = 50_000

/** #11 started, and its test-writer's turn counting `counted` tokens. */
const spent = (counted: number): Entry[] => [
    ticketWorktreeCreated({ ticket: 11 }),
    agentSession({
        ticket: 11,
        role: 'test-writer',
        input: 0,
        output: counted,
        cache_read: 7_000,
        cache_creation: 0,
    }),
]

/** The run went stuck on its budget. */
const runStuck = (): Entry => ({
    kind: 'run_stuck',
    ticket: null,
    role: null,
    content: {
        reason: 'run_budget',
        detail: `The run used ${BUDGET} tokens of its ${BUDGET} budget.`,
    },
})

describe("the run card: the run's tokens against its budget", () => {
    test("the board shows the run's tokens and the run budget from the engine config", async () => {
        const { board } = await runWith({
            budget: BUDGET,
            entries: spent(17_700),
        })

        const state = await board.state()
        expect(state.run_tokens).toBe(17_700)
        expect(state.run_budget_tokens).toBe(BUDGET)
    })

    test('a run whose config sets no budget still shows a run budget: the default', async () => {
        const { board } = await runWith({ entries: spent(100) })

        const state = await board.state()
        expect(state.run_tokens).toBe(100)
        expect(state.run_budget_tokens).toBeGreaterThan(0)
    })
})

describe('the run stuck on its budget', () => {
    test('a run stuck on its budget asks the owner on the spec issue: `retry` or `stop`', async () => {
        const { board } = await runWith({
            budget: BUDGET,
            entries: [...spent(BUDGET), runStuck()],
        })

        const { needs_you } = await board.state()
        expect(needs_you).toHaveLength(1)
        expect(needs_you[0]).toMatchObject({
            ticket: null,
            replies: ['retry', 'stop'],
        })
        expect(`${needs_you[0]?.subject} ${needs_you[0]?.reason}`).toMatch(
            /run budget/i
        )
    })

    test('`retry` adds one more full budget and clears the question; the final review is untouched', async () => {
        const { board } = await runWith({
            budget: BUDGET,
            entries: [
                ...spent(BUDGET),
                runStuck(),
                replyReceived({ word: 'retry', ticket: null }),
            ],
        })

        const state = await board.state()
        expect(state.run_budget_tokens).toBe(BUDGET * 2)
        expect(state.run_tokens).toBe(BUDGET)
        expect(state.needs_you).toEqual([])
        expect(state.final_review.state).toBe('waiting')
    })

    test('`stop` clears the question and keeps the budget', async () => {
        const { board } = await runWith({
            budget: BUDGET,
            entries: [
                ...spent(BUDGET),
                runStuck(),
                replyReceived({ word: 'stop', ticket: null }),
            ],
        })

        const state = await board.state()
        expect(state.run_budget_tokens).toBe(BUDGET)
        expect(state.needs_you).toEqual([])
    })
})
