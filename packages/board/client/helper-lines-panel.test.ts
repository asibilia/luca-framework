import { afterEach, describe, expect, test } from 'bun:test'

import {
    ago,
    cleanUpCards,
    editing,
    showCard,
    startedRun as startRun,
    stepDotsOf,
} from './testing/card-fixtures'
import {
    THEME,
    nodesIn,
    styleOf,
    textOf,
    textsIn,
    type HostNode,
    type Screen,
} from './testing/render-native'

import {
    liveHelper,
    writeLiveFile,
    type LiveAgent,
    type LiveHelper,
} from '../server/testing/live-file-fixtures'
import type { BoardState } from '../shared/board-state'

const { modelColor } = await import('./board-look')

/**
 * Helpers on the cards (#636): the live file lists each agent's helpers
 * (`helpers`: model, latest action with its time, and `done`). Under the
 * step-dots line, each running helper gets one line with a blue (Haiku)
 * left edge: "helper", its model tag, and its latest action. A helper
 * that's done has no line. The cards render through the stand-ins of
 * `testing/render-native.ts`, from board states the plugin's server builds
 * out of fixture journals and fixture live files.
 */

/** #13's implementer at work, its heartbeat busy. */
const busy = (fields: Partial<LiveAgent> = {}): LiveAgent =>
    editing({ activity: Array(30).fill(2), ...fields })

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

afterEach(cleanUpCards)

/** A plugin and a run it started whose engine sent `implementerAtWork`. */
const startedRun = async () => {
    const { board, run_id, runs_dir } = await startRun()
    /** Card #13's state with the live file holding `agent` only. */
    const stateWith = async (agent: LiveAgent): Promise<BoardState> => {
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(1),
            agents: [agent],
        })
        return board.stateOf({ run_id })
    }
    return { stateWith }
}

const lineText = (node: HostNode): string =>
    textsIn(node).map(textOf).join(' ').replace(/\s+/g, ' ').trim()

/** The card's lines after its step-dots line, in order. */
const linesAfterDots = ({ shown }: { shown: Screen }): HostNode[] => {
    const line = stepDotsOf({ shown }).parent
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
            busy({ helpers: [searching(), finished(), reading()] })
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
            state: await stateWith(busy({ helpers: [searching(), reading()] })),
        })
        expect(helperLines({ shown: both })).toHaveLength(2)

        const one = showCard({
            state: await stateWith(
                busy({ helpers: [searching({ done: true }), reading()] })
            ),
        })
        const left = helperLines({ shown: one })
        expect(left).toHaveLength(1)
        expect(lineText(left[0] as HostNode)).toContain('src/slots.ts')
        expect(lineText(left[0] as HostNode)).not.toContain('createSlots')

        const none = showCard({
            state: await stateWith(
                busy({
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
            shown: showCard({ state: await stateWith(busy()) }),
        })

        const empty = looks({
            shown: showCard({
                state: await stateWith(busy({ helpers: [] })),
            }),
        })
        const allDone = looks({
            shown: showCard({
                state: await stateWith(busy({ helpers: [finished()] })),
            }),
        })
        const running = looks({
            shown: showCard({
                state: await stateWith(busy({ helpers: [searching()] })),
            }),
        })

        expect(empty).toBe(before)
        expect(allDone).toBe(before)
        // A running helper does change the card: the comparison can tell.
        expect(running).not.toBe(before)
    })
})
