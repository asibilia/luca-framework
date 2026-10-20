import { createElement } from 'react'

import type { PluginWorkspacePanelProps } from '@getpaseo/plugin/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import {
    NOW,
    ago,
    cleanUpCards,
    implementerAtWork,
} from './testing/card-fixtures'
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

import {
    REPO,
    disk,
    plugin,
    writeJournal,
} from '../server/journal-rebuild-helpers'
import {
    liveAgent,
    writeLiveFile,
    type LiveFeedEntry,
} from '../server/testing/live-file-fixtures'

const { BoardPanel } = await import('./board-panel')
const { modelColor } = await import('./board-look')

/**
 * The live feed (#634): the live file keeps the run's last 50 actions,
 * across tickets, and the side panel shows them in a folded "live feed"
 * section at its bottom. Open, it shows one line per action, newest last:
 * the time, the ticket, the role in its model's colour, and the action.
 * The whole panel renders through the stand-ins of
 * `testing/render-native.ts`, its `board.read` answer the one the plugin's
 * server gives for a fixture journal and a fixture live file.
 */

/** The panel's query of `board.read`, for workspace `ws-1` with nothing picked. */
const QUERY_KEY = ['luca-board', 'ws-1', null, null]

/** Three actions across two tickets, oldest first. */
const THREE: LiveFeedEntry[] = [
    {
        at: ago(30),
        ticket: 12,
        role: 'test-writer',
        model: 'sonnet',
        tool: 'Read',
        target: 'sum.test.ts',
    },
    {
        at: ago(10),
        ticket: 13,
        role: 'implementer',
        model: 'opus',
        tool: 'Edit',
        target: 'gate-runner.ts',
    },
    {
        at: ago(2),
        ticket: 13,
        role: 'implementer',
        model: 'opus',
        tool: 'Bash',
        target: 'bun test src',
    },
]

/** `count` actions by #13's implementer, oldest first, each on its own file. */
const reads = ({
    count,
    from = 1,
}: {
    count: number
    from?: number
}): LiveFeedEntry[] =>
    Array.from({ length: count }, (_, index) => ({
        at: ago(count - index + 5),
        ticket: 13,
        role: 'implementer',
        model: 'opus',
        tool: 'Read',
        target: `part-${from + index}.ts`,
    }))

let screen: Screen | null = null

afterEach(async () => {
    screen?.unmount()
    screen = null
    await cleanUpCards()
})

/** A run the board didn't start, on `REPO`, with its journal and live file. */
const outsideRun = async ({ feed }: { feed: LiveFeedEntry[] }) => {
    const run_id = '20260923t120000z-0c11e9a1'
    const folders = await disk()
    await writeJournal({ ...folders, run_id, entries: implementerAtWork() })
    await writeLiveFile({
        runs_dir: folders.runs_dir,
        run_id,
        written_at: ago(1),
        agents: [liveAgent({ ticket: 13, role: 'implementer' })],
        feed,
    })
    return { ...folders, run_id }
}

/** What the panel's `board.read` answers, from a (re)loaded plugin. */
const readOf = async ({
    registry_dir,
    runs_dir,
    run_id,
}: {
    registry_dir: string
    runs_dir: string
    run_id: string
}) => {
    const board = await plugin({ registry_dir, runs_dir })
    await board.stateOf({ run_id })
    return board.board.readBoard({
        workspace_id: 'ws-1',
        directory: REPO,
        run_id,
    })
}

/** The whole side panel at `NOW`, its `board.read` already answered. */
const showPanel = ({ read }: { read: unknown }) => {
    const client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    })
    client.setQueryData(QUERY_KEY, read)
    setSystemTime(new Date(NOW))
    const props = {
        theme: THEME,
        layout: LAYOUT,
        workspaceId: 'ws-1',
        context: 'workspace',
    } as unknown as PluginWorkspacePanelProps
    const shown = render(
        createElement(
            QueryClientProvider,
            { client },
            createElement(BoardPanel, props)
        )
    )
    screen = shown
    /** The panel's next poll answers `next`. */
    const answer = (next: unknown) => {
        client.setQueryData(QUERY_KEY, next)
        shown.advance(1)
    }
    return { shown, answer }
}

/** The text that reads "live feed": the section's header. */
const feedHeader = ({ shown }: { shown: Screen }): HostNode => {
    const found = shown
        .texts()
        .find((node) => /^\W*live feed\b/i.test(textOf(node).trim()))
    if (!found) throw new Error('no "live feed" section')
    return found
}

/** Whether any text on the panel shows `target`. */
const showsAction = ({
    shown,
    target,
}: {
    shown: Screen
    target: string
}): boolean => shown.texts().some((node) => textOf(node).includes(target))

/** The feed's line for `entry`: the smallest part holding its action and its ticket. */
const lineOf = ({
    shown,
    entry,
}: {
    shown: Screen
    entry: LiveFeedEntry
}): HostNode => {
    const action = shown
        .texts()
        .find((node) => textOf(node).includes(entry.target))
    if (!action) throw new Error(`no feed line for ${entry.target}`)
    let node: HostNode | null = action
    while (node !== null && !textOf(node).includes(`#${entry.ticket}`)) {
        node = node.parent
    }
    if (node === null) throw new Error(`no ticket on ${entry.target}'s line`)
    return node
}

/** The colour `text` is drawn in: its own, or the nearest text's around it. */
const colorOf = ({ line, text }: { line: HostNode; text: string }) => {
    const found = nodesIn(line).find(
        (node) => node.type === 'Text' && textOf(node).trim() === text
    )
    if (!found) throw new Error(`no "${text}" on the line`)
    for (let up: HostNode | null = found; up !== null; up = up.parent) {
        const color = styleOf(up).color
        if (typeof color === 'string') return color
    }
    return null
}

/** A clock time, or an age such as "2s ago". */
const TIME = /\b\d{1,2}:\d{2}(:\d{2})?\b|\b\d+[smh]( \d+s)? ago\b/

describe('the live feed (#634)', () => {
    test('the panel has a "live feed" section at its bottom, folded at first, and a tap opens it', async () => {
        const run = await outsideRun({ feed: THREE })
        const { shown } = showPanel({ read: await readOf(run) })

        // Below the ticket cards and the final review.
        const header = feedHeader({ shown })
        const texts = shown.texts()
        const above = texts.findLastIndex((node) =>
            /^(#1[123]|Final review\b.*)$/.test(textOf(node).trim())
        )
        expect(above).toBeGreaterThanOrEqual(0)
        expect(texts.indexOf(header)).toBeGreaterThan(above)
        expect(showsAction({ shown, target: 'gate-runner.ts' })).toBe(false)

        shown.press(feedHeader({ shown }))

        for (const entry of THREE) {
            expect(showsAction({ shown, target: entry.target })).toBe(true)
        }
    })

    test("open, it shows one line per action, newest last, with the time, the ticket, the role in its model's colour, and the action", async () => {
        const run = await outsideRun({ feed: THREE })
        const { shown } = showPanel({ read: await readOf(run) })
        shown.press(feedHeader({ shown }))

        const lines = THREE.map((entry) => lineOf({ shown, entry }))
        const order = lines.map((line) => nodesIn(shown.root).indexOf(line))
        expect(order).toEqual(order.toSorted((left, right) => left - right))
        THREE.forEach((entry, index) => {
            const line = lines[index]
            if (!line) throw new Error(`no line ${index}`)
            const text = textOf(line)
            expect(text).toMatch(TIME)
            expect(text).toContain(`#${entry.ticket}`)
            expect(text).toContain(entry.role)
            expect(text).toContain(entry.target)
            const others = THREE.filter((other) => other !== entry)
            for (const other of others) {
                expect(text).not.toContain(other.target)
            }
            expect(colorOf({ line, text: entry.role })).toBe(
                modelColor({ model: entry.model ?? '', theme: THEME })
            )
            const wrapping = textsIn(line).filter(
                (node) => node.props.numberOfLines !== 1
            )
            expect(wrapping.map(textOf)).toEqual([])
        })
    })

    test('a reload shows the actions the live file holds, and nothing older', async () => {
        const run = await outsideRun({ feed: reads({ count: 50 }) })
        await readOf(run)
        await writeLiveFile({
            runs_dir: run.runs_dir,
            run_id: run.run_id,
            written_at: ago(0),
            agents: [],
            feed: reads({ count: 50, from: 11 }),
        })

        const { shown } = showPanel({ read: await readOf(run) })
        shown.press(feedHeader({ shown }))

        const everyPart = Array.from({ length: 60 }, (_, index) => index + 1)
        const shownParts = everyPart.filter((n) =>
            showsAction({ shown, target: `part-${n}.ts` })
        )
        expect(shownParts).toEqual(
            Array.from({ length: 50 }, (_, index) => index + 11)
        )
    })

    test('while the panel is open, the feed stays open or folded as it was left', async () => {
        const run = await outsideRun({ feed: reads({ count: 3 }) })
        const { shown, answer } = showPanel({ read: await readOf(run) })
        shown.press(feedHeader({ shown }))
        expect(showsAction({ shown, target: 'part-3.ts' })).toBe(true)

        await writeLiveFile({
            runs_dir: run.runs_dir,
            run_id: run.run_id,
            written_at: ago(0),
            agents: [],
            feed: reads({ count: 4 }),
        })
        answer(await readOf(run))
        expect(showsAction({ shown, target: 'part-4.ts' })).toBe(true)

        shown.press(feedHeader({ shown }))
        expect(showsAction({ shown, target: 'part-4.ts' })).toBe(false)
        await writeLiveFile({
            runs_dir: run.runs_dir,
            run_id: run.run_id,
            written_at: ago(0),
            agents: [
                liveAgent({
                    ticket: 13,
                    role: 'implementer',
                    action: { tool: 'Edit', target: 'later.ts', at: ago(1) },
                }),
            ],
            feed: [
                ...reads({ count: 4 }),
                {
                    at: ago(1),
                    ticket: 13,
                    role: 'implementer',
                    model: 'opus',
                    tool: 'Edit',
                    target: 'later.ts',
                },
            ],
        })
        answer(await readOf(run))
        // The card took the new read; the feed stayed folded.
        const later = shown
            .texts()
            .filter((node) => textOf(node).includes('later.ts'))
        expect(later.length).toBe(1)
        expect(feedHeader({ shown })).toBeDefined()
        expect(showsAction({ shown, target: 'part-4.ts' })).toBe(false)
    })
})
