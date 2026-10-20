import { Fragment, createElement } from 'react'

import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import { mockPanelQuery, panelQuery } from './testing/panel-query'
import {
    HOST,
    LAYOUT,
    THEME,
    nodesIn,
    render,
    styleOf,
    textOf,
    textsIn,
    type HostNode,
    type Screen,
} from './testing/render-native'

import { createHarness, type Harness } from '../server/testing/board-harness'
import {
    intakeRead,
    runBranchCreated,
    runStarted,
    specSnapshot,
    ticketSnapshot,
    ticketWorktreeCreated,
    wholeTicket,
    type Entry,
} from '../server/testing/journal-fixtures'
import {
    agentTurnStarts,
    testsCommitted,
} from '../server/ticket-stages-panel-helpers'
import { ROW_KIND } from '../shared/board-rows'
import { BoardStateSchema, type BoardState } from '../shared/board-state'

mockPanelQuery()

const { makeStyles } = await import('./board-panel-styles')
const { StageHeader } = await import('./board-panel-parts')
const { SharedBubbles } = await import('./one-line')
const { BoardPanel } = await import('./board-panel')
const { RunFooter } = await import('./run-footer')
const { EventRowLine, RunRowCard } = await import('./timeline-rows')
const { TicketCardView } = await import('./ticket-card-view')

/**
 * The side panel's one-line rule (#626): every card line and the footer
 * stay on one line, cut at the end with "…"; a tap on a cut line opens a
 * bubble with its full text. The cards and footer render through the
 * stand-ins of `testing/render-native.ts`, from board states the plugin's
 * server builds out of fixture journals.
 */

const LONG_TITLE =
    'Add the menu item that exports the filtered rows as CSV, TSV or JSON, keeping the column order the person picked, with a note when rows were left out'

/** Intake of spec #10 with one ticket, #13, whose title is long. */
const intake = (): Entry[] => [
    runStarted({ spec: 10 }),
    intakeRead({ spec: 10 }),
    specSnapshot({ spec: 10, title: 'Add CSV export', order: [13] }),
    ticketSnapshot({ number: 13, title: LONG_TITLE }),
    runBranchCreated({ branch: 'luca/run-10' }),
]

/** #13's implementer at work, after its tests were committed. */
const implementerAtWork = (): Entry[] => [
    ...intake(),
    ...testsCommitted({ ticket: 13 }),
    ...agentTurnStarts({ ticket: 13, role: 'implementer' }),
]

let harness: Harness | null = null
let screen: Screen | null = null

afterEach(async () => {
    screen?.unmount()
    screen = null
    setSystemTime()
    await harness?.cleanup()
    harness = null
})

/** The board state the plugin's server keeps after `entries`. */
const stateAfter = async ({
    entries,
}: {
    entries: Entry[]
}): Promise<{ state: BoardState; started: Harness }> => {
    const started = await createHarness()
    harness = started
    const { run_id, token } = await started.start()
    const reply = await started.send({ run_id, token, entries })
    expect(reply.ok).toBe(true)
    return { state: await started.state(), started }
}

const look = () => ({
    theme: THEME,
    styles: makeStyles({ theme: THEME, compact: LAYOUT.compact }),
})

const showCard = ({
    state,
    number = 13,
}: {
    state: BoardState
    number?: number
}): Screen => {
    const ticket = state.tickets.find((card) => card.number === number)
    if (!ticket) throw new Error(`no ticket #${number}`)
    screen = render(
        createElement(TicketCardView, {
            ticket,
            state,
            open: false,
            onToggle: () => undefined,
            ...look(),
        })
    )
    return screen
}

const showFooter = ({ state }: { state: BoardState }): Screen => {
    screen = render(createElement(RunFooter, { state, ...look() }))
    return screen
}

/** One line, cut at its end: `numberOfLines={1}`, tail ellipsis. */
const isOneLine = (node: HostNode): boolean =>
    node.props.numberOfLines === 1 &&
    (node.props.ellipsizeMode === undefined ||
        node.props.ellipsizeMode === 'tail')

/** The lines on `shown` that may wrap, by their text. */
const wrappingLines = ({ shown }: { shown: Screen }): string[] => [
    ...shown
        .texts()
        .filter((node) => !isOneLine(node))
        .map((node) => `text: ${textOf(node)}`),
    ...shown
        .all()
        .filter((node) => styleOf(node).flexWrap === 'wrap')
        .map((node) => `row: ${textOf(node)}`),
]

/** The one-line text that shows `text`, cut or not. */
const lineWith = ({ shown, text }: { shown: Screen; text: string }) => {
    const found = shown
        .texts()
        .find((node) => isOneLine(node) && textOf(node).includes(text))
    if (!found) throw new Error(`no one-line text with "${text}"`)
    return found
}

/** Whether a bubble shows all of `text`: a text that isn't cut to a line. */
const bubbleShows = ({
    shown,
    text,
}: {
    shown: Screen
    text: string
}): boolean =>
    shown
        .texts()
        .some(
            (node) =>
                node.props.numberOfLines !== 1 && textOf(node).includes(text)
        )

/** The card itself: the outermost node a tap reaches. */
const cardOf = ({ shown }: { shown: Screen }): HostNode => {
    const found = shown
        .all()
        .find((node) => typeof node.props.onPress === 'function')
    if (!found) throw new Error('no card to tap')
    return found
}

/**
 * Whether `part` keeps its size: it, or a wrapper holding only it, has
 * `flexShrink: 0`.
 */
const keepsSize = ({ part }: { part: HostNode }): boolean => {
    const own = new Set(nodesIn(part))
    let node: HostNode | null = part
    while (node !== null) {
        if (styleOf(node).flexShrink === 0) return true
        const up: HostNode | null = node.parent
        if (up === null) return false
        const wraps = textsIn(up).every((text) => own.has(text))
        if (!wraps) return false
        node = up
    }
    return false
}

/** The `Text` (at any depth) showing exactly `text`. */
const textNode = ({ shown, text }: { shown: Screen; text: string }) => {
    const found = shown
        .all()
        .find((node) => node.type === 'Text' && textOf(node) === text)
    if (!found) throw new Error(`no text "${text}"`)
    return found
}

/** 12:00:06Z, the time of #13's `ticket_worktree_created` (seq 6). */
const STARTED_AT = Date.parse('2026-09-23T12:00:06.000Z')

/** The stored board state's keys before #626, top level and per ticket. */
const STORED_KEYS = [
    'run',
    'for_a_person',
    'usage',
    'usage_label',
    'run_tokens',
    'run_budget_tokens',
    'run_budget_each',
    'limit_wait',
    'usage_line_wait',
    'run_plan_used',
    'needs_you',
    'tickets',
    'final_review',
    'jev',
    'messages',
    'memory',
    'shared_git_changed',
    'run_steps',
    'current_step',
    'event_count',
    'latest',
]

const STORED_TICKET_KEYS = [
    'number',
    'title',
    'refactor',
    'blockers',
    'started',
    'stage',
    'step',
    'activity',
    'role',
    'current_step',
    'fix_round',
    'review_round',
    'review_fix_round',
    'open_check',
    'failed_turn',
    'tests',
    'baseline_tests',
    'findings',
    'tokens',
    'agent_tokens',
    'tried',
    'plan_used',
]

const only = (
    value: Record<string, unknown>,
    keys: string[]
): Record<string, unknown> =>
    Object.fromEntries(
        Object.entries(value).filter(([key]) => keys.includes(key))
    )

describe('card lines and the footer stay on one line (#626)', () => {
    test('every card line stays on one line, its long text cut at the end', async () => {
        const { state } = await stateAfter({ entries: implementerAtWork() })
        const shown = showCard({ state })

        expect(textOf(lineWith({ shown, text: LONG_TITLE }))).toContain(
            LONG_TITLE
        )
        expect(wrappingLines({ shown })).toEqual([])
    })

    test('every footer line stays on one line', async () => {
        const { state } = await stateAfter({ entries: implementerAtWork() })
        const shown = showFooter({ state })

        expect(shown.texts().length).toBeGreaterThan(0)
        expect(wrappingLines({ shown })).toEqual([])
    })

    test('a tap on a cut line opens a bubble with its full text, and a second tap closes it', async () => {
        const { state } = await stateAfter({ entries: implementerAtWork() })
        const shown = showCard({ state })
        expect(bubbleShows({ shown, text: LONG_TITLE })).toBe(false)

        shown.press(lineWith({ shown, text: LONG_TITLE }))
        expect(bubbleShows({ shown, text: LONG_TITLE })).toBe(true)

        shown.press(lineWith({ shown, text: LONG_TITLE }))
        expect(bubbleShows({ shown, text: LONG_TITLE })).toBe(false)
    })

    test('a tap elsewhere on the card closes the bubble', async () => {
        const { state } = await stateAfter({ entries: implementerAtWork() })
        const shown = showCard({ state })
        shown.press(lineWith({ shown, text: LONG_TITLE }))
        expect(bubbleShows({ shown, text: LONG_TITLE })).toBe(true)

        shown.press(cardOf({ shown }))
        expect(bubbleShows({ shown, text: LONG_TITLE })).toBe(false)
    })

    test('a tap anywhere else on the panel closes the bubble: a stage header, or the blank footer', async () => {
        const { state } = await stateAfter({ entries: implementerAtWork() })
        const ticket = state.tickets.find((card) => card.number === 13)
        if (!ticket) throw new Error('no ticket #13')
        const shared = look()
        const folds: string[] = []
        const shown = render(
            createElement(SharedBubbles, {
                style: shared.styles.content,
                children: createElement(
                    Fragment,
                    null,
                    createElement(StageHeader, {
                        title: 'Building',
                        hint: '',
                        icon: 'Hammer',
                        count: 1,
                        color: THEME.colors.foreground,
                        folded: false,
                        onPress: () => folds.push('Building'),
                        ...shared,
                    }),
                    createElement(TicketCardView, {
                        ticket,
                        state,
                        open: false,
                        onToggle: () => undefined,
                        ...shared,
                    }),
                    createElement(RunFooter, { state, ...shared })
                ),
            })
        )
        screen = shown
        const open = () => {
            shown.press(lineWith({ shown, text: LONG_TITLE }))
            expect(bubbleShows({ shown, text: LONG_TITLE })).toBe(true)
        }

        open()
        shown.press(textNode({ shown, text: 'BUILDING' }))
        expect(bubbleShows({ shown, text: LONG_TITLE })).toBe(false)
        expect(folds).toEqual(['Building'])

        open()
        const rule = shown
            .all()
            .find((node) => node.props.style === shared.styles.rule)
        if (!rule) throw new Error('no footer rule')
        shown.press(rule)
        expect(bubbleShows({ shown, text: LONG_TITLE })).toBe(false)
    })

    test('the ticket number, status pill, step dots and fix and review chips never shrink; the title gives way', async () => {
        const { state } = await stateAfter({ entries: implementerAtWork() })
        const ticket = state.tickets.find((card) => card.number === 13)
        if (!ticket) throw new Error('no ticket #13')
        const shown = showCard({ state })
        const dots = shown
            .all()
            .find((node) =>
                String(node.props.accessibilityLabel ?? '').startsWith('Steps:')
            )
        if (!dots) throw new Error('no step dots')
        const parts = {
            number: textNode({ shown, text: '#13' }),
            pill: textNode({ shown, text: ticket.activity }),
            dots,
            fix: textNode({ shown, text: 'fix 0/3' }),
            review: textNode({ shown, text: 'review 0/3' }),
        }

        const shrinking = Object.entries(parts)
            .filter(([, part]) => !keepsSize({ part }))
            .map(([name]) => name)
        expect(shrinking).toEqual([])
        expect(
            Number(
                styleOf(lineWith({ shown, text: LONG_TITLE })).flexShrink ?? 0
            )
        ).toBeGreaterThan(0)
    })

    test("the footer's latest line says how long ago it was, counting up every second", async () => {
        const { state } = await stateAfter({
            entries: [...intake(), ticketWorktreeCreated({ ticket: 13 })],
        })
        panelQuery.state = state
        setSystemTime(new Date(STARTED_AT + (4 * 60 + 43) * 1000))
        const shown = render(
            createElement(BoardPanel, {
                theme: THEME,
                layout: LAYOUT,
                workspaceId: 'workspace-1',
            } as never)
        )
        screen = shown
        const latest = () =>
            shown
                .texts()
                .map(textOf)
                .find((text) => /latest\W+\d+m \d+s ago/.test(text))

        expect(latest()).toMatch(/latest\W+4m 43s ago/)

        shown.advance(1000)
        expect(latest()).toMatch(/latest\W+4m 44s ago/)
    })

    test("the chat rows still wrap in full, while the footer's same line is one line", async () => {
        const { state, started } = await stateAfter({
            entries: [...intake(), ticketWorktreeCreated({ ticket: 13 })],
        })
        const rows = started.latestRows().map(({ row }) => row)
        const event = rows.findLast((row) => row.kind === ROW_KIND.event)
        const header = rows.findLast((row) => row.kind === ROW_KIND.run)
        if (event?.kind !== ROW_KIND.event || header?.kind !== ROW_KIND.run) {
            throw new Error('no event row or header row')
        }
        const host = {
            theme: THEME,
            host: HOST,
            layout: LAYOUT,
            agentId: 'agent-1',
            timestamp: new Date(STARTED_AT),
        }
        const plugin = { type: 'plugin' as const, version: 1 }
        const eventRow = render(
            createElement(EventRowLine, {
                ...host,
                item: { ...plugin, kind: event.kind, data: event.data },
            })
        )
        const headerRow = render(
            createElement(RunRowCard, {
                ...host,
                item: { ...plugin, kind: header.kind, data: header.data },
            })
        )
        const limited = [...eventRow.texts(), ...headerRow.texts()]
            .filter((node) => node.props.numberOfLines !== undefined)
            .map(textOf)
        eventRow.unmount()
        headerRow.unmount()

        expect(limited).toEqual([])
        expect(eventRow.texts().map(textOf)).toContain(event.data.text)

        panelQuery.state = state
        const panel = render(
            createElement(BoardPanel, {
                theme: THEME,
                layout: LAYOUT,
                workspaceId: 'workspace-1',
            } as never)
        )
        screen = panel
        const latest = panel
            .texts()
            .find((node) => /latest\W+\d+[hms]/.test(textOf(node)))
        expect(latest?.props.numberOfLines).toBe(1)
    })

    test('an old journal and a stored board state from before still load, on one line', async () => {
        const { state } = await stateAfter({
            entries: [...intake(), ...wholeTicket({ ticket: 13 })],
        })
        const json = JSON.parse(JSON.stringify(state)) as Record<
            string,
            unknown
        >
        const stored = {
            ...only(json, STORED_KEYS),
            tickets: (json.tickets as Record<string, unknown>[]).map((ticket) =>
                only(ticket, STORED_TICKET_KEYS)
            ),
        }
        const parsed = BoardStateSchema.safeParse(stored)
        expect(parsed.success).toBe(true)
        if (!parsed.success) return
        expect(parsed.data.tickets[0]?.stage).toBe('done')

        const card = showCard({ state: parsed.data })
        expect(wrappingLines({ shown: card })).toEqual([])
        card.unmount()
        const footer = showFooter({ state: parsed.data })
        expect(wrappingLines({ shown: footer })).toEqual([])
        expect(footer.texts().length).toBeGreaterThan(0)
    })

    test('the board docs describe the one-line rule and the bubble', async () => {
        const docs = await Bun.file(
            new URL('../docs/panel-and-rows.md', import.meta.url)
        ).text()

        expect(docs).toMatch(/one line/i)
        expect(docs).toContain('…')
        expect(docs).toMatch(/bubble/i)
    })
})
