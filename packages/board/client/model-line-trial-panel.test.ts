import { createElement } from 'react'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    LAYOUT,
    THEME,
    render,
    textOf,
    type Screen,
} from './testing/render-native'

import { createHarness, type Harness } from '../server/testing/board-harness'
import {
    intakeRead,
    runBranchCreated,
    specSnapshot,
    ticketSnapshot,
    type Entry,
} from '../server/testing/journal-fixtures'
import {
    stepStarted,
    testsCommitted,
} from '../server/ticket-stages-panel-helpers'

const { makeStyles } = await import('./board-panel-styles')
const { TicketCardView } = await import('./ticket-card-view')

/**
 * Clef's line for a model trial's launch, and the default confidence bar
 * (#698), on #13's card, from a board state the plugin's server builds out
 * of a fixture journal with no `models` block.
 */

/** #13's journal up to `role`'s launch on `model`, after Clef picked `pick`. */
const journalWith = ({
    role,
    model,
    model_reason,
    pick,
    confidence,
}: {
    role: string
    model: string
    model_reason: string
    pick: string
    confidence: number
}): Entry[] => {
    const entries: Entry[] = [
        {
            kind: 'run_started',
            ticket: null,
            role: null,
            content: {
                spec_number: 10,
                base_branch: 'main',
                config: { checks: { test: 'bun test' } },
            },
        },
        intakeRead({ spec: 10 }),
        specSnapshot({ spec: 10, title: 'Add CSV export', order: [13] }),
        ticketSnapshot({ number: 13, title: 'Export rows as CSV' }),
        runBranchCreated({ branch: 'luca/run-10' }),
        ...testsCommitted({ ticket: 13 }),
        stepStarted({ ticket: 13, step: `launch_agent:${role}`, role }),
    ]
    const asked_seq = entries.length + 1
    return [
        ...entries,
        {
            kind: 'jev_asked',
            ticket: 13,
            role,
            content: {
                job: 'agent_model',
                request: {
                    state: { ticket: '#13 Export rows as CSV', role },
                    questions: {
                        model: {
                            type: 'choice',
                            instructions: `Which model should the ${role} agent run on?`,
                            criteria: { opus: null, sonnet: null },
                        },
                    },
                },
                fixed: { model: 'opus' },
                model: '@cf/cloudflare/clef',
                acted: true,
            },
        },
        {
            kind: 'jev_answered',
            ticket: 13,
            role,
            content: {
                job: 'agent_model',
                asked_seq,
                answers: {
                    model: { value: pick, confidence, raw: { pick } },
                },
                ms: 380,
                model: '@cf/cloudflare/clef',
            },
        },
        {
            kind: 'agent_started',
            ticket: 13,
            role,
            content: {
                role,
                prompt: `You are the ${role}.`,
                follow_up_of: null,
                model,
                model_reason,
            },
        },
    ]
}

let harness: Harness | null = null
let screen: Screen | null = null

afterEach(async () => {
    screen?.unmount()
    screen = null
    await harness?.cleanup()
    harness = null
})

/** The one-line texts of #13's card, drawn from `entries`. */
const cardLines = async ({
    entries,
}: {
    entries: Entry[]
}): Promise<string[]> => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    const reply = await harness.send({ run_id, token, entries })
    expect(reply.ok).toBe(true)
    const state = await harness.state()
    const ticket = state.tickets.find((card) => card.number === 13)
    if (!ticket) throw new Error('no ticket #13')
    screen = render(
        createElement(TicketCardView, {
            ticket,
            state,
            open: false,
            onToggle: () => undefined,
            theme: THEME,
            styles: makeStyles({ theme: THEME, compact: LAYOUT.compact }),
        })
    )
    return screen
        .texts()
        .filter((node) => node.props.numberOfLines === 1)
        .map(textOf)
}

describe("Clef's line for a model trial (#698)", () => {
    test("a trial launch's Clef line reads like a decision_model pick, ending in (trial)", async () => {
        const lines = await cardLines({
            entries: journalWith({
                role: 'test-writer',
                model: 'sonnet',
                model_reason: 'trial',
                pick: 'sonnet',
                confidence: 0.2,
            }),
        })
        const clef = lines.find((line) => line.includes('→'))

        expect(clef).toBe('0.20 split → sonnet (trial)')
    })

    test('with no models block, the board judges sharp against the default 0.5 bar', async () => {
        const lines = await cardLines({
            entries: journalWith({
                role: 'implementer',
                model: 'sonnet',
                model_reason: 'decision_model',
                pick: 'sonnet',
                confidence: 0.56,
            }),
        })

        expect(lines).toContain('0.56 sharp → sonnet')
    })
})
