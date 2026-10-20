import { rm } from 'node:fs/promises'

import { createElement } from 'react'

import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import { mockPanelQuery, panelQuery } from './testing/panel-query'
import {
    LAYOUT,
    THEME,
    render,
    styleOf,
    textOf,
    type HostNode,
    type Screen,
} from './testing/render-native'

import { dirs, disk, plugin } from '../server/journal-rebuild-helpers'
import {
    intakeRead,
    runBranchCreated,
    runStarted,
    specSnapshot,
    ticketSnapshot,
    unifiedRateLimit,
    wholeTicket,
    type Entry,
} from '../server/testing/journal-fixtures'
import {
    liveAgent,
    writeLiveFile,
    type LiveAgent,
} from '../server/testing/live-file-fixtures'
import {
    agentTurnStarts,
    testsCommitted,
} from '../server/ticket-stages-panel-helpers'
import type { BoardState } from '../shared/board-state'

mockPanelQuery()

const { makeStyles } = await import('./board-panel-styles')
const { modelColor } = await import('./board-look')
const { RunFooter } = await import('./run-footer')
const { StatusBar } = await import('./status-bar')
const { BoardPanel } = await import('./board-panel')

/**
 * The status bar (#633): one line pinned at the bottom of the panel,
 * "4/10 joined · 2·1 agents · 3.1M/15M tok · week 42% · latest 2s ago",
 * from a board state a journal and a live file make. A tap shows it all in
 * words. It replaces the footer's separate latest line.
 */

/** The bar, as a person reads it, for the run below at its latest event + 2s. */
const BAR = '4/10 joined · 2·1 agents · 3.1M/15M tok · week 42% · latest 2s ago'

const SENTENCE =
    "4 of 10 tickets joined · agents running: 2 on opus, 1 on sonnet · 3.1M of the run's 15M tokens · plan 42% used this week · latest event 2s ago"

/** Ten tickets, #21 to #30, none blocked on another. */
const TICKETS = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]

/**
 * Intake of ten tickets; #21 to #24 joined, #25 to #27 each with an
 * implementer at work, #28 to #30 not started.
 */
const runOfTen = (): Entry[] => [
    runStarted({ spec: 20 }),
    intakeRead({ spec: 20 }),
    specSnapshot({ spec: 20, title: 'Big export', order: TICKETS }),
    ...TICKETS.map((number) =>
        ticketSnapshot({ number, title: `Part ${number}` })
    ),
    runBranchCreated({ branch: 'luca/run-20' }),
    ...[21, 22, 23, 24].flatMap((ticket) => wholeTicket({ ticket })),
    ...[25, 26, 27].flatMap((ticket) => [
        ...testsCommitted({ ticket }),
        ...agentTurnStarts({ ticket, role: 'implementer' }),
    ]),
]

/** Two implementers on opus and one on sonnet are in a turn. */
const threeAgents = (): LiveAgent[] => [
    liveAgent({ ticket: 25, role: 'implementer', model: 'opus' }),
    liveAgent({ ticket: 26, role: 'implementer', model: 'opus' }),
    liveAgent({ ticket: 27, role: 'implementer', model: 'sonnet' }),
]

const WEEKLY_42 = {
    ...unifiedRateLimit({
        windows: {
            five_hour: { utilization: 0.13 },
            seven_day: { utilization: 0.42 },
        },
    }),
    arrived_at: '2026-09-23T12:00:30.000Z',
}

let screen: Screen | null = null

afterEach(async () => {
    screen?.unmount()
    screen = null
    panelQuery.state = null
    setSystemTime()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

/**
 * The state the plugin's server keeps for a run it started, with
 * `entries` and a live file of `agents` (and the first plan reading).
 */
const stateOfRun = async ({
    entries,
    agents,
    plan_usage = null,
}: {
    entries: Entry[]
    agents: LiveAgent[]
    plan_usage?: Record<string, unknown> | null
}): Promise<BoardState> => {
    const folders = await disk()
    const board = await plugin(folders)
    const { run_id, token } = await board.start()
    const reply = await board.send({ run_id, token, entries })
    expect(reply.ok).toBe(true)
    await writeLiveFile({
        runs_dir: folders.runs_dir,
        run_id,
        written_at: new Date().toISOString(),
        agents,
        plan_usage,
    })
    return board.stateOf({ run_id })
}

/** The clock at `seconds` after the state's latest event. */
const clockAfterLatest = ({
    state,
    seconds,
}: {
    state: BoardState
    seconds: number
}) => {
    if (state.latest_at === null) throw new Error('no latest event')
    setSystemTime(new Date(Date.parse(state.latest_at) + seconds * 1000))
}

const look = () => ({
    theme: THEME,
    styles: makeStyles({ theme: THEME, compact: LAYOUT.compact }),
})

const showBar = ({ state }: { state: BoardState }): Screen => {
    screen?.unmount()
    screen = render(createElement(StatusBar, { state, ...look() }))
    return screen
}

/** The bar's own line: the text that begins with its joined count. */
const barLine = ({ shown }: { shown: Screen }): HostNode => {
    const found = shown
        .texts()
        .find((node) => /^\d+\/\d+ joined/.test(textOf(node)))
    if (!found) throw new Error('no status bar line')
    return found
}

/** A text showing exactly `text`, nested inside a line or not. */
const textShowing = ({ shown, text }: { shown: Screen; text: string }) =>
    shown.all().find((node) => node.type === 'Text' && textOf(node) === text)

describe('the status bar (#633)', () => {
    test('the bar shows joined, agents, tokens, week and latest in that order, on one line', async () => {
        const state = await stateOfRun({
            entries: runOfTen(),
            agents: threeAgents(),
            plan_usage: WEEKLY_42,
        })
        clockAfterLatest({ state, seconds: 2 })

        const shown = showBar({
            state: {
                ...state,
                run_tokens: 3_100_000,
                run_budget_tokens: 15_000_000,
            },
        })

        const line = barLine({ shown })
        expect(textOf(line)).toBe(BAR)
        expect(line.props.numberOfLines).toBe(1)
        expect(line.props.ellipsizeMode ?? 'tail').toBe('tail')
        expect(shown.texts().length).toBe(1)
        expect(
            shown.all().filter((node) => styleOf(node).flexWrap === 'wrap')
        ).toEqual([])
    })

    test('the bar stays pinned at the bottom: outside the scrolling cards and after them', async () => {
        const state = await stateOfRun({
            entries: runOfTen(),
            agents: threeAgents(),
            plan_usage: WEEKLY_42,
        })
        panelQuery.state = state
        clockAfterLatest({ state, seconds: 2 })

        screen = render(
            createElement(BoardPanel, {
                theme: THEME,
                layout: LAYOUT,
                workspaceId: 'workspace-1',
            } as never)
        )
        const nodes = screen.all()
        const bar = nodes.find(
            (node) =>
                node.type === 'Text' && /^\d+\/\d+ joined/.test(textOf(node))
        )
        const card = nodes.find(
            (node) => node.type === 'Text' && textOf(node) === '#25'
        )
        if (!bar) throw new Error('no status bar on the panel')
        if (!card) throw new Error('no card #25 on the panel')

        const scrolls = (node: HostNode): boolean => {
            for (let up = node.parent; up !== null; up = up.parent) {
                if (up.type === 'ScrollView') return true
            }
            return false
        }
        expect(scrolls(card)).toBe(true)
        expect(scrolls(bar)).toBe(false)
        expect(nodes.indexOf(bar)).toBeGreaterThan(nodes.indexOf(card))
    })

    test("each model's agent count is in the model's colour, counted from the agents in a turn", async () => {
        const state = await stateOfRun({
            entries: runOfTen(),
            agents: threeAgents(),
        })
        clockAfterLatest({ state, seconds: 2 })

        const shown = showBar({ state })

        const opus = textShowing({ shown, text: '2' })
        const sonnet = textShowing({ shown, text: '1' })
        expect(opus && styleOf(opus).color).toBe(
            modelColor({ model: 'opus', theme: THEME })
        )
        expect(sonnet && styleOf(sonnet).color).toBe(
            modelColor({ model: 'sonnet', theme: THEME })
        )
        expect(modelColor({ model: 'opus', theme: THEME })).not.toBe(
            modelColor({ model: 'sonnet', theme: THEME })
        )
        expect(textOf(barLine({ shown }))).toContain(' · 2·1 agents · ')
    })

    test("the tokens are out of the run's budget", async () => {
        const state = await stateOfRun({
            entries: runOfTen(),
            agents: threeAgents(),
        })
        clockAfterLatest({ state, seconds: 2 })

        const shown = showBar({
            state: {
                ...state,
                run_tokens: 6_200_000,
                run_budget_tokens: 30_000_000,
            },
        })

        expect(textOf(barLine({ shown }))).toContain(' · 6.2M/30M tok · ')
    })

    test('before the first plan reading, the bar shows "week –"', async () => {
        const state = await stateOfRun({
            entries: runOfTen(),
            agents: threeAgents(),
        })
        expect(state.usage).toBeNull()
        clockAfterLatest({ state, seconds: 2 })

        const shown = showBar({ state })

        expect(textOf(barLine({ shown }))).toContain(
            ' · week – · latest 2s ago'
        )
    })

    test('a tap on the bar shows all of it in words, and a second tap closes it', async () => {
        const state = await stateOfRun({
            entries: runOfTen(),
            agents: threeAgents(),
            plan_usage: WEEKLY_42,
        })
        clockAfterLatest({ state, seconds: 2 })
        const shown = showBar({
            state: {
                ...state,
                run_tokens: 3_100_000,
                run_budget_tokens: 15_000_000,
            },
        })
        const bubble = () =>
            shown
                .texts()
                .find(
                    (node) =>
                        node.props.numberOfLines !== 1 &&
                        textOf(node) === SENTENCE
                )

        expect(bubble()).toBeUndefined()

        shown.press(barLine({ shown }))
        expect(bubble()).toBeDefined()

        shown.press(barLine({ shown }))
        expect(bubble()).toBeUndefined()
    })

    test("the footer's separate latest line is gone, and the bar's latest age counts up", async () => {
        const state = await stateOfRun({
            entries: runOfTen(),
            agents: threeAgents(),
        })
        expect(state.latest).not.toBeNull()
        clockAfterLatest({ state, seconds: 2 })

        const footer = render(createElement(RunFooter, { state, ...look() }))
        const footerTexts = footer.texts().map(textOf)
        footer.unmount()
        expect(footerTexts.length).toBeGreaterThan(0)
        expect(footerTexts.filter((text) => text.startsWith('latest'))).toEqual(
            []
        )
        expect(footerTexts.join(' ')).not.toContain(state.latest ?? '')

        const shown = showBar({ state })
        expect(textOf(barLine({ shown }))).toContain('latest 2s ago')
        shown.advance(1000)
        expect(textOf(barLine({ shown }))).toContain('latest 3s ago')
    })
})
