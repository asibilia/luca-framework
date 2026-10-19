import { join } from 'node:path'

import { createElement } from 'react'

import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import {
    LAYOUT,
    THEME,
    render,
    styleOf,
    textOf,
    type HostNode,
    type Screen,
} from './testing/render-native'

import { createHarness, type Harness } from '../server/testing/board-harness'
import {
    baselineTests,
    replyReceived,
    stamp,
    ticketSkipped,
    ticketStuck,
    type Entry,
} from '../server/testing/journal-fixtures'
import {
    UMC3_TICKETS,
    approvalEnds,
    doneTicket,
    intakeOf,
    joinChecksAndPush,
    joinStep,
    p9drUpToSeq1070,
    stepOf,
    stepOff,
    stepOn,
    ticketWaiting,
    umc3UpToSeq72,
    upToReview,
    worktreeReady,
} from '../server/testing/journal-fixtures-waits'
import type { BoardState } from '../shared/board-state'

const { makeStyles } = await import('./board-panel-styles')
const { TicketCardView } = await import('./ticket-card-view')

/**
 * Waits between steps say why (#558, #559): a ticket that waits on purpose
 * shows an amber bar, the pill "waiting", and what it waits for, with a
 * time that counts up. The engine's `ticket_waiting` gives the reason; an
 * old journal without it gets the same texts from the board's own rules,
 * or "waiting for the engine's next step" when none fits. The cards render
 * through the stand-ins of `testing/render-native.ts`, from board states
 * the plugin's server builds out of fixture journals.
 */

let harness: Harness | null = null
const screens: Screen[] = []

afterEach(async () => {
    for (const shown of screens.splice(0)) shown.unmount()
    setSystemTime()
    await harness?.cleanup()
    harness = null
})

/** The run, as the plugin's server got it, and its board state. */
const stateAfter = async ({
    entries,
}: {
    entries: Entry[]
}): Promise<{ state: BoardState; run: { run_id: string; token: string } }> => {
    const started = await createHarness()
    harness = started
    const { run_id, token } = await started.start()
    const run = { run_id, token }
    const reply = await started.send({ ...run, entries })
    expect(reply.ok).toBe(true)
    return { state: await started.state(), run }
}

const showCard = ({
    state,
    number,
}: {
    state: BoardState
    number: number
}): Screen => {
    const ticket = state.tickets.find((card) => card.number === number)
    if (!ticket) throw new Error(`no ticket #${number}`)
    const shown = render(
        createElement(TicketCardView, {
            ticket,
            state,
            open: false,
            onToggle: () => undefined,
            theme: THEME,
            styles: makeStyles({ theme: THEME, compact: LAYOUT.compact }),
        })
    )
    screens.push(shown)
    return shown
}

/** Every line of the card as one text, its parts joined by single spaces. */
const cardText = ({ shown }: { shown: Screen }): string =>
    shown.texts().map(textOf).join(' ').replace(/\s+/g, ' ')

/** Any wait text a card may show. */
const WAIT_LINE =
    /waiting for #\d+'s baseline tests|waiting to join after #\d+|starts once #\d+ has joined|waiting for the engine's next step|waiting for a (prepare|test) slot/

/** The amber bar: a bar drawn in the theme's warning color. */
const hasAmberBar = ({ shown }: { shown: Screen }): boolean =>
    shown
        .all()
        .some(
            (node) =>
                node.type === 'View' &&
                styleOf(node).backgroundColor === THEME.colors.statusWarning
        )

/** The `Text` showing exactly "waiting": the pill of a waiting card. */
const waitingPill = ({ shown }: { shown: Screen }): HostNode | null =>
    shown
        .all()
        .find((node) => node.type === 'Text' && textOf(node) === 'waiting') ??
    null

/** The time the journal stamps on the record after `before`. */
const nextTime = ({ before }: { before: Entry[] }): string => {
    const [stamped] = stamp({
        entries: before.slice(0, 1),
        first_seq: before.length + 1,
    })
    if (!stamped) throw new Error('no record before')
    return stamped.time
}

/** `ms` after `iso`, as the clock's time. */
const later = ({ iso, ms }: { iso: string; ms: number }): Date =>
    new Date(Date.parse(iso) + ms)

/** 4m 43s. */
const FOUR_43 = (4 * 60 + 43) * 1000

const THREE = [{ number: 11 }, { number: 12 }, { number: 13 }]

/** #11 runs the baseline tests #12 shares, from the same run-branch commit. */
const baselineRunning = (): Entry[] => [
    ...intakeOf({ spec: 10, tickets: THREE }),
    ...worktreeReady({ ticket: 11 }),
    ...worktreeReady({ ticket: 12 }),
    stepOn({ ticket: 11, step: 'run_baseline_tests' }),
]

describe('a waiting card (#559)', () => {
    test('a ticket waiting for the shared baseline shows the amber bar, the amber pill "waiting", and its wait text with a time that counts up', async () => {
        const before = baselineRunning()
        const since = nextTime({ before })
        const { state } = await stateAfter({
            entries: [
                ...before,
                ticketWaiting({
                    ticket: 12,
                    waiting_for: 'baseline',
                    on_ticket: 11,
                    since,
                }),
            ],
        })
        setSystemTime(later({ iso: since, ms: FOUR_43 }))

        const waiting = showCard({ state, number: 12 })
        expect(cardText({ shown: waiting })).toContain(
            "waiting for #11's baseline tests · 4m 43s"
        )
        waiting.advance(1000)
        expect(cardText({ shown: waiting })).toContain(
            "waiting for #11's baseline tests · 4m 44s"
        )
        const pill = waitingPill({ shown: waiting })
        expect(pill ? styleOf(pill).color : null).toBe(
            THEME.colors.statusWarning
        )
        expect(hasAmberBar({ shown: waiting })).toBe(true)

        // #11, running the baseline tests, is working, not waiting.
        const working = showCard({ state, number: 11 })
        expect(cardText({ shown: working })).toContain(
            'running the baseline tests'
        )
        expect(waitingPill({ shown: working })).toBeNull()
        expect(hasAmberBar({ shown: working })).toBe(false)
    })

    test('a ticket in the join queue reads "waiting to join after #n" with its time, and one in the start queue "starts once #n has joined"', async () => {
        const before = [
            ...intakeOf({ spec: 10, tickets: THREE }),
            ...upToReview({ ticket: 11 }),
            ...upToReview({ ticket: 12 }),
            ...approvalEnds({ ticket: 11 }),
            ...joinStep({ ticket: 11 }),
            stepOn({ ticket: 11, step: 'run_gates' }),
            ...approvalEnds({ ticket: 12 }),
        ]
        const since = nextTime({ before })
        const join = ticketWaiting({
            ticket: 12,
            waiting_for: 'join',
            on_ticket: 11,
            since,
        })
        const { state } = await stateAfter({
            entries: [
                ...before,
                join,
                ticketWaiting({
                    ticket: 13,
                    waiting_for: 'start',
                    on_ticket: 11,
                    since: nextTime({ before: [...before, join] }),
                }),
            ],
        })
        setSystemTime(later({ iso: since, ms: FOUR_43 }))

        const joining = showCard({ state, number: 12 })
        expect(cardText({ shown: joining })).toContain(
            'waiting to join after #11 · 4m 43s'
        )
        expect(waitingPill({ shown: joining })).not.toBeNull()
        const starting = showCard({ state, number: 13 })
        expect(cardText({ shown: starting })).toContain(
            'starts once #11 has joined'
        )
        expect(waitingPill({ shown: starting })).not.toBeNull()
        expect(hasAmberBar({ shown: starting })).toBe(true)
    })

    test("the ticket's next step ends its wait", async () => {
        const before = baselineRunning()
        const { state, run } = await stateAfter({
            entries: [
                ...before,
                ticketWaiting({
                    ticket: 12,
                    waiting_for: 'baseline',
                    on_ticket: 11,
                    since: nextTime({ before }),
                }),
            ],
        })
        expect(cardText({ shown: showCard({ state, number: 12 }) })).toMatch(
            WAIT_LINE
        )

        const reply = await harness?.send({
            ...run,
            first_seq: before.length + 2,
            entries: [
                baselineTests({ ticket: 11, passed: 4 }),
                stepOff({ ticket: 11, step: 'run_baseline_tests' }),
                stepOn({ ticket: 12, step: 'reuse_baseline_tests' }),
            ],
        })
        expect(reply?.ok).toBe(true)
        const moved = await harness?.state()
        if (!moved) throw new Error('no board state')
        const shown = showCard({ state: moved, number: 12 })
        expect(cardText({ shown })).not.toMatch(WAIT_LINE)
        expect(waitingPill({ shown })).toBeNull()
        expect(hasAmberBar({ shown })).toBe(false)
    })
})

describe('waits in old journals, with no ticket_waiting (#558)', () => {
    test("a journal shaped like run umc3 up to seq 72 shows #554–#557 each waiting for #553's baseline tests, with a time, and #553 running the baseline tests", async () => {
        const { state } = await stateAfter({ entries: umc3UpToSeq72() })

        for (const number of UMC3_TICKETS.slice(1)) {
            expect(cardText({ shown: showCard({ state, number }) })).toMatch(
                /waiting for #553's baseline tests · \d+[hms]/
            )
        }
        const runner = cardText({ shown: showCard({ state, number: 553 }) })
        expect(runner).toContain('running the baseline tests')
        expect(runner).not.toMatch(WAIT_LINE)
    })

    test('a journal shaped like run p9dr up to seq 1070 shows #329 waiting to join after #331', async () => {
        const { state } = await stateAfter({ entries: p9drUpToSeq1070() })

        expect(cardText({ shown: showCard({ state, number: 329 }) })).toMatch(
            /waiting to join after #331 · \d+[hms]/
        )
    })

    test('a ticket whose blocker is done, while another ticket joins, reads "starts once #n has joined"', async () => {
        const { state } = await stateAfter({
            entries: [
                ...intakeOf({
                    spec: 10,
                    tickets: [
                        { number: 11 },
                        { number: 12 },
                        { number: 13, blockers: [12] },
                    ],
                }),
                ...upToReview({ ticket: 11 }),
                ...doneTicket({ ticket: 12 }),
                ...approvalEnds({ ticket: 11 }),
                ...joinStep({ ticket: 11 }),
                stepOn({ ticket: 11, step: 'run_gates' }),
            ],
        })

        const shown = showCard({ state, number: 13 })
        expect(cardText({ shown })).toContain('starts once #11 has joined')
        expect(waitingPill({ shown })).not.toBeNull()
    })

    test('when no rule fits, a waiting card reads "waiting for the engine\'s next step", never a wrong reason', async () => {
        const { state } = await stateAfter({
            entries: [
                ...intakeOf({ spec: 10, tickets: THREE }),
                ...worktreeReady({ ticket: 11 }),
                ...worktreeReady({ ticket: 12 }),
                // #11's baseline is done: #12 has nothing left to wait for.
                ...stepOf({
                    ticket: 11,
                    step: 'run_baseline_tests',
                    entries: [baselineTests({ ticket: 11, passed: 4 })],
                }),
                // #13 is approved, with no other ticket ahead of it to join.
                ...upToReview({ ticket: 13 }),
                ...approvalEnds({ ticket: 13 }),
            ],
        })

        const lines = [11, 12, 13].map(
            (number) =>
                `#${number}: ${cardText({ shown: showCard({ state, number }) }).match(WAIT_LINE)?.[0] ?? 'no wait line'}`
        )
        expect(lines).toEqual([
            "#11: waiting for the engine's next step",
            "#12: waiting for the engine's next step",
            "#13: waiting for the engine's next step",
        ])
    })
})

describe('cards that never wait', () => {
    test('a done, stuck, skipped or blocked card shows no wait line, while a waiting card beside them does', async () => {
        const tickets = [
            { number: 11 },
            { number: 12 },
            { number: 13 },
            { number: 14, blockers: [12] },
            { number: 15 },
        ]
        const first = [
            ...intakeOf({ spec: 10, tickets }),
            ...upToReview({ ticket: 11 }),
            ...approvalEnds({ ticket: 11 }),
        ]
        const startWait = ticketWaiting({
            ticket: 13,
            waiting_for: 'start',
            on_ticket: 11,
            since: nextTime({ before: first }),
        })
        const second = [...first, startWait, ...worktreeReady({ ticket: 12 })]
        const { state } = await stateAfter({
            entries: [
                ...second,
                // Waits that never ended with a step: #12 got stuck, the
                // owner skipped #13.
                ticketWaiting({
                    ticket: 12,
                    waiting_for: 'baseline',
                    on_ticket: 11,
                    since: nextTime({ before: second }),
                }),
                ticketStuck({
                    ticket: 12,
                    reason: 'agent_failed',
                    detail: 'The test-writer failed.',
                }),
                ...joinStep({ ticket: 11 }),
                ...joinChecksAndPush({ ticket: 11 }),
                replyReceived({ word: 'skip', ticket: 13 }),
                ticketSkipped({ ticket: 13 }),
                ...upToReview({ ticket: 15 }),
                ...approvalEnds({ ticket: 15 }),
            ],
        })

        expect(
            [11, 12, 13, 14].map(
                (number) =>
                    state.tickets.find((card) => card.number === number)?.stage
            )
        ).toEqual(['done', 'stuck', 'skipped', 'blocked'])
        const shownWait = [11, 12, 13, 14, 15].map((number) => {
            const shown = showCard({ state, number })
            const waits =
                WAIT_LINE.test(cardText({ shown })) ||
                waitingPill({ shown }) !== null ||
                hasAmberBar({ shown })
            return `#${number}: ${waits ? 'waits' : 'no wait'}`
        })
        expect(shownWait).toEqual([
            '#11: no wait',
            '#12: no wait',
            '#13: no wait',
            '#14: no wait',
            '#15: waits',
        ])
    })
})

describe('the board docs', () => {
    test('the vocabulary lists ticket_waiting', async () => {
        const docs = await Promise.all(
            [
                'vocabulary-run-kinds.md',
                'vocabulary-engine-kinds.md',
                'vocabulary-ticket-kinds.md',
            ].map((name) =>
                Bun.file(join(import.meta.dir, '..', 'docs', name)).text()
            )
        )
        const rows = docs
            .join('\n')
            .split('\n')
            .filter((line) => line.startsWith('| `'))

        expect(rows.some((line) => line.startsWith('| `ticket_waiting`'))).toBe(
            true
        )
    })
})
