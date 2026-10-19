import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { createElement } from 'react'

import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import {
    LAYOUT,
    THEME,
    render,
    textOf,
    textsIn,
    type Screen,
} from './testing/render-native'

import {
    dirs,
    disk,
    plugin,
    writeJournal,
} from '../server/journal-rebuild-helpers'
import {
    agentSession,
    intakeOfThree,
    unifiedRateLimit,
    type Entry,
} from '../server/testing/journal-fixtures'
import {
    liveAgent,
    removeLiveFile,
    writeLiveFile,
    type LiveAgent,
} from '../server/testing/live-file-fixtures'
import {
    agentTurnStarts,
    testsCommitted,
} from '../server/ticket-stages-panel-helpers'
import type { BoardState } from '../shared/board-state'

const { makeStyles } = await import('./board-panel-styles')
const { tokensText } = await import('./board-look')
const { TicketCardView } = await import('./ticket-card-view')

/**
 * The live file on the cards (#628): the board reads each run's
 * `live.json` (`<runs_dir>/<run_id>/live.json`) on its tick, for the runs
 * it started and the ones it didn't. A card with a live entry says who is
 * working and what they're doing, next to its step dots; its tokens count
 * up with the turn, followed by the latest action's age. With no live
 * file, the card shows today's step text. The cards render through the
 * stand-ins of `testing/render-native.ts`, from board states the plugin's
 * server builds out of fixture journals and fixture live files.
 */

/** The panel's clock in these tests: just after the harness's own. */
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
        ...fields,
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

/**
 * A board plugin with a runs folder, and a run it started from a chat
 * whose engine sent `entries`.
 */
const startedRun = async ({ entries }: { entries: Entry[] }) => {
    const folders = await disk()
    const board = await plugin(folders)
    const { run_id, token } = await board.start()
    const reply = await board.send({ run_id, token, entries })
    expect(reply.ok).toBe(true)
    return { board, run_id, runs_dir: folders.runs_dir }
}

const look = () => ({
    theme: THEME,
    styles: makeStyles({ theme: THEME, compact: LAYOUT.compact }),
})

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
            ...look(),
        })
    )
    return screen
}

/** Every text on `shown`, in order, as one line. */
const textsOf = ({ shown }: { shown: Screen }): string =>
    shown.texts().map(textOf).join(' ').replace(/\s+/g, ' ')

/** The texts on the step dots' own line, as one line. */
const dotsLine = ({ shown }: { shown: Screen }): string => {
    const dots = shown
        .all()
        .find((node) =>
            String(node.props.accessibilityLabel ?? '').startsWith('Steps:')
        )
    if (!dots?.parent) throw new Error('no step dots')
    return textsIn(dots.parent).map(textOf).join(' ').replace(/\s+/g, ' ')
}

describe('the live file on the cards (#628)', () => {
    test('a card with a live entry shows "<role> <icon> <action>" next to its step dots, where the step text was', async () => {
        const { board, run_id, runs_dir } = await startedRun({
            entries: implementerAtWork(),
        })
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(1),
            agents: [editing()],
        })

        const shown = showCard({ state: await board.stateOf({ run_id }) })

        expect(dotsLine({ shown })).toContain(
            'implementer ✎ editing gate-runner.ts'
        )
        expect(textsOf({ shown })).not.toContain('waiting for the implementer')
    })

    test('while a tool call is open, the card shows "▸ <command> · running <time>"', async () => {
        const { board, run_id, runs_dir } = await startedRun({
            entries: implementerAtWork(),
        })
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(1),
            agents: [
                editing({
                    action: { tool: 'Bash', target: 'bun test', at: ago(192) },
                    open_call: {
                        tool: 'Bash',
                        target: 'bun test',
                        started_at: ago(192),
                    },
                }),
            ],
        })

        const shown = showCard({ state: await board.stateOf({ run_id }) })

        expect(dotsLine({ shown })).toContain('▸ bun test · running 3m 12s')
    })

    test('the card\'s tokens count up from the live file, followed by "· <age> ago"', async () => {
        const { board, run_id, runs_dir } = await startedRun({
            entries: implementerAtWork(),
        })
        const before = (await board.stateOf({ run_id })).tickets.find(
            (card) => card.number === 13
        )
        const journaled = before?.tokens ?? 0
        expect(journaled).toBeGreaterThan(0)

        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(1),
            agents: [editing({ tokens: 2500 })],
        })
        const first = textsOf({
            shown: showCard({ state: await board.stateOf({ run_id }) }),
        })
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(0),
            agents: [
                editing({
                    tokens: 4500,
                    action: { tool: 'Read', target: 'sum.ts', at: ago(1) },
                }),
            ],
        })
        const later = textsOf({
            shown: showCard({ state: await board.stateOf({ run_id }) }),
        })

        expect(first).toContain(
            `${tokensText({ tokens: journaled + 2500 })} tokens · 2s ago`
        )
        expect(later).toContain(
            `${tokensText({ tokens: journaled + 4500 })} tokens · 1s ago`
        )
    })

    test("with no live file, the card shows today's step text", async () => {
        const { board, run_id, runs_dir } = await startedRun({
            entries: implementerAtWork(),
        })
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(1),
            agents: [editing()],
        })
        const live = dotsLine({
            shown: showCard({ state: await board.stateOf({ run_id }) }),
        })

        await removeLiveFile({ runs_dir, run_id })
        const shown = showCard({ state: await board.stateOf({ run_id }) })

        expect(live).toContain('implementer ✎ editing gate-runner.ts')
        expect(textsOf({ shown })).toContain('waiting for the implementer')
        expect(textsOf({ shown })).not.toContain('✎')
    })

    test("a run the plugin didn't start shows its live entry on its card", async () => {
        const OUTSIDE = '20260923t120000z-0c11e9a1'
        const folders = await disk()
        await writeJournal({
            ...folders,
            run_id: OUTSIDE,
            entries: implementerAtWork(),
        })
        await writeLiveFile({
            runs_dir: folders.runs_dir,
            run_id: OUTSIDE,
            written_at: ago(1),
            agents: [editing()],
        })
        const board = await plugin(folders)

        const shown = showCard({
            state: await board.stateOf({ run_id: OUTSIDE }),
        })

        expect(dotsLine({ shown })).toContain(
            'implementer ✎ editing gate-runner.ts'
        )
    })

    test("the panel's plan usage fills in from the live file's first reading", async () => {
        const { board, run_id, runs_dir } = await startedRun({
            entries: implementerAtWork(),
        })
        expect((await board.stateOf({ run_id })).usage).toBeNull()

        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(1),
            agents: [editing()],
            plan_usage: {
                ...unifiedRateLimit({
                    windows: {
                        five_hour: { utilization: 0.13 },
                        seven_day: { utilization: 0.42 },
                    },
                }),
                arrived_at: ago(30),
            },
        })

        expect((await board.stateOf({ run_id })).usage).toMatchObject({
            five_hour_percent: 13,
            weekly_percent: 42,
        })
    })

    test('the board docs describe the live file', async () => {
        const folder = join(import.meta.dir, '../docs')
        const texts = await Promise.all(
            [...new Bun.Glob('*.md').scanSync(folder)].map((name) =>
                Bun.file(join(folder, name)).text()
            )
        )
        const readme = await Bun.file(
            join(import.meta.dir, '../README.md')
        ).text()

        const describing = [readme, ...texts].filter((text) =>
            text.includes('live.json')
        )
        expect(describing.length).toBeGreaterThan(0)
        expect(describing.join('\n')).toMatch(/live file/i)
    })
})
