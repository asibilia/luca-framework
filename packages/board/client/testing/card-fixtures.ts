import { rm } from 'node:fs/promises'

import { createElement } from 'react'

import { setSystemTime } from 'bun:test'

import {
    LAYOUT,
    THEME,
    render,
    textOf,
    textsIn,
    type HostNode,
    type Screen,
} from './render-native'

import { dirs, disk, plugin } from '../../server/journal-rebuild-helpers'
import {
    agentSession,
    intakeOfThree,
    type Entry,
} from '../../server/testing/journal-fixtures'
import {
    liveAgent,
    type LiveAgent,
} from '../../server/testing/live-file-fixtures'
import {
    agentTurnStarts,
    testsCommitted,
} from '../../server/ticket-stages-panel-helpers'
import type { BoardState } from '../../shared/board-state'

const { makeStyles } = await import('../board-panel-styles')
const { TicketCardView } = await import('../ticket-card-view')

/**
 * The ticket-card tests' shared pieces: a run the plugin's server keeps
 * from a fixture journal, #13's implementer at work in it, and a card
 * rendered through the stand-ins of `render-native.ts` at a fixed clock,
 * with ways to read its lines and its heartbeat. A test file calls
 * `cleanUpCards` after each test.
 */

/** The panel's clock in these tests: just after the harness's own. */
export const NOW = Date.parse('2026-09-23T12:31:00.000Z')

/** The time `seconds` before `NOW`, as the live file writes times. */
export const ago = (seconds: number): string =>
    new Date(NOW - seconds * 1000).toISOString()

/** #13's tests are committed and its implementer is at work. */
export const implementerAtWork = (): Entry[] => [
    ...intakeOfThree(),
    ...testsCommitted({ ticket: 13 }),
    agentSession({ ticket: 13, role: 'test-writer', input: 1000, output: 200 }),
    ...agentTurnStarts({ ticket: 13, role: 'implementer' }),
]

/** #13's implementer in the live file, two seconds after editing `gate-runner.ts`. */
export const editing = (fields: Partial<LiveAgent> = {}): LiveAgent =>
    liveAgent({
        ticket: 13,
        role: 'implementer',
        tokens: 2500,
        action: { tool: 'Edit', target: 'gate-runner.ts', at: ago(2) },
        ...fields,
    })

/**
 * A board plugin with a runs folder, and a run it started from a chat
 * whose engine sent `entries` (#13's implementer at work, unless told).
 */
export const startedRun = async ({
    entries = implementerAtWork(),
}: { entries?: Entry[] } = {}) => {
    const folders = await disk()
    const board = await plugin(folders)
    const { run_id, token } = await board.start()
    const reply = await board.send({ run_id, token, entries })
    if (!reply.ok) throw new Error('the plugin refused the entries')
    return { board, run_id, runs_dir: folders.runs_dir }
}

/** The host theme and the panel's styles, as the panel hands them down. */
export const look = () => ({
    theme: THEME,
    styles: makeStyles({ theme: THEME, compact: LAYOUT.compact }),
})

/** The cards rendered in the current test, unmounted by `cleanUpCards`. */
const shownCards: Screen[] = []

/** Card `number` (#13 unless told) of `state`, rendered at `at` (`NOW` unless told). */
export const showCard = ({
    state,
    number = 13,
    at = NOW,
}: {
    state: BoardState
    number?: number
    at?: number
}): Screen => {
    const ticket = state.tickets.find((card) => card.number === number)
    if (!ticket) throw new Error(`no ticket #${number}`)
    setSystemTime(new Date(at))
    const shown = render(
        createElement(TicketCardView, {
            ticket,
            state,
            open: false,
            onToggle: () => undefined,
            ...look(),
        })
    )
    shownCards.push(shown)
    return shown
}

/** Unmounts the test's cards, puts the clock back, and removes its folders. */
export const cleanUpCards = async () => {
    for (const shown of shownCards.splice(0)) shown.unmount()
    setSystemTime()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
}

/** Texts joined into one line, runs of white space made one space. */
export const oneLine = (texts: string[]): string =>
    texts.join(' ').replace(/\s+/g, ' ')

/** Every text on `shown`, in order, as one line. */
export const cardText = ({ shown }: { shown: Screen }): string =>
    oneLine(shown.texts().map(textOf))

/** The card's step dots: the node labelled "Steps: …". */
export const stepDotsOf = ({ shown }: { shown: Screen }): HostNode => {
    const dots = shown
        .all()
        .find((node) =>
            String(node.props.accessibilityLabel ?? '').startsWith('Steps:')
        )
    if (!dots) throw new Error('no step dots')
    return dots
}

/** The texts on the step dots' own line, as one line. */
export const dotsLine = ({ shown }: { shown: Screen }): string => {
    const line = stepDotsOf({ shown }).parent
    if (!line) throw new Error('no step-dots line')
    return oneLine(textsIn(line).map(textOf))
}

/** The card's heartbeat (#631), the node labelled "Heartbeat", or `null` with none. */
export const heartbeatOf = ({ shown }: { shown: Screen }): HostNode | null =>
    shown.all().find((node) => node.props.accessibilityLabel === 'Heartbeat') ??
    null

/** The bars of a heartbeat, left to right. */
export const barsOf = ({ beat }: { beat: HostNode }): HostNode[] =>
    beat.children.filter(
        (child): child is HostNode => typeof child !== 'string'
    )
