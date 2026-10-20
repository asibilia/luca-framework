import { rm } from 'node:fs/promises'

import { createElement } from 'react'

import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import {
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

import { dirs, disk, plugin } from '../server/journal-rebuild-helpers'
import {
    agentSession,
    intakeOfThree,
    type Entry,
} from '../server/testing/journal-fixtures'
import {
    liveAgent,
    liveHelper,
    writeLiveFile,
    type LiveAgent,
    type LiveHelper,
} from '../server/testing/live-file-fixtures'
import {
    agentTurnStarts,
    testsCommitted,
} from '../server/ticket-stages-panel-helpers'
import type { BoardState } from '../shared/board-state'

const { makeStyles } = await import('./board-panel-styles')
const { modelColor } = await import('./board-look')
const { TicketCardView } = await import('./ticket-card-view')

/**
 * Helpers on the cards (#636): the live file lists each agent's helpers
 * (`helpers`: model, latest action with its time, and `done`). Under the
 * step-dots line, each running helper gets one line with a blue (Haiku)
 * left edge: "helper", its model tag, and its latest action. A helper
 * that's done has no line. The cards render through the stand-ins of
 * `testing/render-native.ts`, from board states the plugin's server builds
 * out of fixture journals and fixture live files.
 */

const NOW = Date.parse('2026-09-23T12:31:00.000Z')

const ago = (seconds: number): string =>
    new Date(NOW - seconds * 1000).toISOString()

/** #13's tests are committed and its implementer is at work. */
const implementerAtWork = (): Entry[] => [
    ...intakeOfThree(),
    ...testsCommitted({ ticket: 13 }),
    agentSession({ ticket: 13, role: 'test-writer', input: 1000, output: 200 }),
    ...agentTurnStarts({ ticket: 13, role: 'implementer' }),
]

/** #13's implementer, two seconds after editing `gate-runner.ts`. */
const editing = (fields: Partial<LiveAgent> = {}): LiveAgent =>
    liveAgent({
        ticket: 13,
        role: 'implementer',
        tokens: 2500,
        action: { tool: 'Edit', target: 'gate-runner.ts', at: ago(2) },
        activity: Array(30).fill(2),
        ...fields,
    })

/** A helper searching for `createSlots`. */
const searching = (fields: Partial<LiveHelper> = {}): LiveHelper =>
    liveHelper({
        action: { tool: 'Grep', target: 'createSlots', at: ago(3) },
        ...fields,
    })

/** A helper reading `src/slots.ts`. */
const reading = (fields: Partial<LiveHelper> = {}): LiveHelper =>
    liveHelper({
        action: { tool: 'Read', target: 'src/slots.ts', at: ago(1) },
        ...fields,
    })

/** A helper that finished after globbing `old-notes`. */
const finished = (): LiveHelper =>
    liveHelper({
        action: { tool: 'Glob', target: 'old-notes', at: ago(20) },
        done: true,
    })

let screen: Screen | null = null

afterEach(async () => {
    screen?.unmount()
    screen = null
    setSystemTime()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

/** A plugin and a run it started whose engine sent `implementerAtWork`. */
const startedRun = async () => {
    const folders = await disk()
    const board = await plugin(folders)
    const { run_id, token } = await board.start()
    const reply = await board.send({
        run_id,
        token,
        entries: implementerAtWork(),
    })
    expect(reply.ok).toBe(true)
    /** Card #13's state with the live file holding `agent` only. */
    const stateWith = async (agent: LiveAgent): Promise<BoardState> => {
        await writeLiveFile({
            runs_dir: folders.runs_dir,
            run_id,
            written_at: ago(1),
            agents: [agent],
        })
        return board.stateOf({ run_id })
    }
    return { stateWith }
}

/** Card #13 of `state`, rendered at `NOW`. */
const showCard = ({ state }: { state: BoardState }): Screen => {
    const ticket = state.tickets.find((card) => card.number === 13)
    if (!ticket) throw new Error('no ticket #13')
    setSystemTime(new Date(NOW))
    screen?.unmount()
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
}

const lineText = (node: HostNode): string =>
    textsIn(node).map(textOf).join(' ').replace(/\s+/g, ' ').trim()

/** The card's lines after its step-dots line, in order. */
const linesAfterDots = ({ shown }: { shown: Screen }): HostNode[] => {
    const dots = shown
        .all()
        .find((node) =>
            String(node.props.accessibilityLabel ?? '').startsWith('Steps:')
        )
    const line = dots?.parent
    if (!line?.parent) throw new Error('no step dots')
    const lines = line.parent.children.filter(
        (child): child is HostNode => typeof child !== 'string'
    )
    return lines.slice(lines.indexOf(line) + 1)
}

const isHelperLine = (node: HostNode): boolean =>
    lineText(node).startsWith('helper')

/** Every helper line on the card. */
const helperLines = ({ shown }: { shown: Screen }): HostNode[] =>
    linesAfterDots({ shown }).filter(isHelperLine)

/** The card as rendered, every node's type, text, label and style. */
const looks = ({ shown }: { shown: Screen }): string =>
    JSON.stringify(
        shown
            .all()
            .map((node) => [
                node.type,
                node.type === 'Text' ? textOf(node) : null,
                node.props.accessibilityLabel ?? null,
                styleOf(node),
            ])
    )

describe('helpers on the cards (#636)', () => {
    test('each running helper gets one line right under the step-dots line: "helper", its haiku tag and its latest action, with a blue left edge', async () => {
        const { stateWith } = await startedRun()
        const state = await stateWith(
            editing({ helpers: [searching(), finished(), reading()] })
        )

        const shown = showCard({ state })

        const [first, second, after] = linesAfterDots({ shown })
        expect(first && isHelperLine(first)).toBe(true)
        expect(second && isHelperLine(second)).toBe(true)
        expect(after && isHelperLine(after)).toBe(false)
        expect(helperLines({ shown })).toHaveLength(2)
        const haiku = modelColor({ model: 'haiku', theme: THEME })
        for (const [line, words] of [
            [first, ['haiku', '⌕', 'createSlots']],
            [second, ['haiku', 'src/slots.ts']],
        ] as const) {
            if (!line) throw new Error('no helper line')
            for (const word of words) expect(lineText(line)).toContain(word)
            expect(
                nodesIn(line).some(
                    (node) => styleOf(node).borderLeftColor === haiku
                )
            ).toBe(true)
        }
        expect(lineText(first as HostNode)).not.toContain('old-notes')
    })

    test("a helper's line goes away once the live file says it's done", async () => {
        const { stateWith } = await startedRun()

        const both = showCard({
            state: await stateWith(
                editing({ helpers: [searching(), reading()] })
            ),
        })
        expect(helperLines({ shown: both })).toHaveLength(2)

        const one = showCard({
            state: await stateWith(
                editing({ helpers: [searching({ done: true }), reading()] })
            ),
        })
        const left = helperLines({ shown: one })
        expect(left).toHaveLength(1)
        expect(lineText(left[0] as HostNode)).toContain('src/slots.ts')
        expect(lineText(left[0] as HostNode)).not.toContain('createSlots')

        const none = showCard({
            state: await stateWith(
                editing({
                    helpers: [
                        searching({ done: true }),
                        reading({ done: true }),
                    ],
                })
            ),
        })
        expect(helperLines({ shown: none })).toEqual([])
    })

    test('with no helpers, or only finished ones, the card looks as it did before helpers', async () => {
        const { stateWith } = await startedRun()
        const before = looks({
            shown: showCard({ state: await stateWith(editing()) }),
        })

        const empty = looks({
            shown: showCard({
                state: await stateWith(editing({ helpers: [] })),
            }),
        })
        const allDone = looks({
            shown: showCard({
                state: await stateWith(editing({ helpers: [finished()] })),
            }),
        })
        const running = looks({
            shown: showCard({
                state: await stateWith(editing({ helpers: [searching()] })),
            }),
        })

        expect(empty).toBe(before)
        expect(allDone).toBe(before)
        // A running helper does change the card: the comparison can tell.
        expect(running).not.toBe(before)
    })
})
