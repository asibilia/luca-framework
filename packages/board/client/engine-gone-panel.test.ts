import { rm } from 'node:fs/promises'

import { createElement } from 'react'

import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import {
    LAYOUT,
    THEME,
    render,
    styleOf,
    textOf,
    textsIn,
    type HostNode,
    type Screen,
} from './testing/render-native'

import { listed } from '../server/engine-restart-helpers'
import {
    dirs,
    disk,
    plugin,
    writeJournal,
} from '../server/journal-rebuild-helpers'
import { unfinishedResult } from '../server/testing/board-harness'
import {
    agentSession,
    intakeOfThree,
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

const { makeStyles } = await import('./board-panel-styles')
const { TicketCardView } = await import('./ticket-card-view')

/**
 * A run whose engine is gone or hung says so on its busy cards (#635),
 * whoever started it. The plugin's process check (`checkEngines`) also
 * covers the runs it only reads, and only labels those: the card's
 * step-dots line reads "engine not running · last sign of life 3m 40s ago"
 * (the last sign being the live file's `written_at`), and the plugin never
 * restarts them. A live file whose `written_at` is more than 60 seconds old
 * reads "no sign of life for 1m 10s". In both cases the busy card's
 * heartbeat is a flat red line (the theme's danger colour) and its timers
 * stop. A long tool call, with the live file rewritten every 5 seconds,
 * shows neither. The cards render through the stand-ins of
 * `testing/render-native.ts`, from board states the plugin's server builds
 * out of fixture journals and fixture live files.
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

/** #13's implementer, two seconds before the live file's write. */
const editing = (fields: Partial<LiveAgent> = {}): LiveAgent =>
    liveAgent({
        ticket: 13,
        role: 'implementer',
        tokens: 2500,
        action: { tool: 'Edit', target: 'gate-runner.ts', at: ago(224) },
        // Loud activity, so a red flat line can't be mistaken for a quiet one.
        activity: Array.from({ length: 30 }, () => 8),
        ...fields,
    })

const screens: Screen[] = []

afterEach(async () => {
    for (const shown of screens.splice(0)) shown.unmount()
    setSystemTime()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

const OUTSIDE = '20260923t120000z-0c11e9a1'

/** A run the plugin didn't start, with a journal of #13 at work. */
const commandLineRun = async () => {
    const folders = await disk()
    await writeJournal({
        ...folders,
        run_id: OUTSIDE,
        entries: implementerAtWork(),
    })
    const board = await plugin(folders)
    return { board, run_id: OUTSIDE, runs_dir: folders.runs_dir }
}

/** A run the plugin started from a chat, whose engine sent #13 at work. */
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
    return { board, run_id, runs_dir: folders.runs_dir }
}

/** Card #13 of `state`, rendered at `at`. */
const showCard = ({
    state,
    at = NOW,
}: {
    state: BoardState
    at?: number
}): Screen => {
    const ticket = state.tickets.find((card) => card.number === 13)
    if (!ticket) throw new Error('no ticket #13')
    setSystemTime(new Date(at))
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

const oneLine = (texts: string[]): string =>
    texts.join(' ').replace(/\s+/g, ' ')

/** Every text on `shown`, as one line. */
const cardText = ({ shown }: { shown: Screen }): string =>
    oneLine(shown.texts().map(textOf))

/** The texts on the step dots' own line, as one line. */
const dotsLine = ({ shown }: { shown: Screen }): string => {
    const dots = shown
        .all()
        .find((node) =>
            String(node.props.accessibilityLabel ?? '').startsWith('Steps:')
        )
    if (!dots?.parent) throw new Error('no step dots')
    return oneLine(textsIn(dots.parent).map(textOf))
}

/** The card's tokens text, such as "3.7k tokens · 2s ago". */
const tokensLine = ({ shown }: { shown: Screen }): string => {
    const found = shown
        .texts()
        .map(textOf)
        .find((text) => text.includes(' tokens'))
    if (found === undefined) throw new Error('no tokens text')
    return found
}

const heartbeatOf = ({ shown }: { shown: Screen }): HostNode | null =>
    shown.all().find((node) => node.props.accessibilityLabel === 'Heartbeat') ??
    null

/** The heights and colours of a card's heartbeat bars, left to right. */
const barsOf = ({
    shown,
}: {
    shown: Screen
}): { heights: number[]; colors: unknown[] } => {
    const beat = heartbeatOf({ shown })
    if (beat === null) throw new Error('no heartbeat')
    const bars = beat.children.filter(
        (child): child is HostNode => typeof child !== 'string'
    )
    return {
        heights: bars.map((bar) => Number(styleOf(bar).height)),
        colors: bars.map((bar) => styleOf(bar).backgroundColor),
    }
}

const GONE = /engine not running/
const STALE = /no sign of life/

describe('a run whose engine is gone (#635)', () => {
    test('a command-line run with no engine process reads "engine not running · last sign of life <age> ago", and the plugin does not restart it', async () => {
        const { board, run_id, runs_dir } = await commandLineRun()
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(220),
            agents: [editing()],
        })
        // The listing would let the run go on, if the plugin looked at it.
        board.setCommandResult({
            result: unfinishedResult({ runs: [listed({ run_id })] }),
        })

        const summary = await board.board.checkEngines()
        const shown = showCard({ state: await board.stateOf({ run_id }) })

        expect(summary).toEqual({ restarted: [], stopped: [] })
        expect(board.spawns).toEqual([])
        expect(dotsLine({ shown })).toContain(
            'engine not running · last sign of life 3m 40s ago'
        )
        expect(dotsLine({ shown })).not.toContain('editing gate-runner.ts')
    })
})

describe('a live file that went quiet (#635)', () => {
    test('a live file written more than 60 seconds ago reads "no sign of life for <age>"', async () => {
        const { board, run_id, runs_dir } = await startedRun()
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(70),
            agents: [editing()],
        })
        board.engineRunning({ run_id })

        await board.board.checkEngines()
        const shown = showCard({ state: await board.stateOf({ run_id }) })

        expect(dotsLine({ shown })).toContain('no sign of life for 1m 10s')
        expect(cardText({ shown })).not.toMatch(GONE)
    })
})

describe('busy cards of a run with no sign of life (#635)', () => {
    /** The two cases: no engine process, and a live file gone stale. */
    const cases = async () => {
        const gone = await commandLineRun()
        await writeLiveFile({
            runs_dir: gone.runs_dir,
            run_id: gone.run_id,
            written_at: ago(220),
            agents: [
                editing({
                    open_call: {
                        tool: 'Bash',
                        target: 'bun test',
                        started_at: ago(400),
                    },
                }),
            ],
        })
        await gone.board.board.checkEngines()

        const stale = await startedRun()
        await writeLiveFile({
            runs_dir: stale.runs_dir,
            run_id: stale.run_id,
            written_at: ago(70),
            agents: [
                editing({
                    open_call: {
                        tool: 'Bash',
                        target: 'bun test',
                        started_at: ago(400),
                    },
                }),
            ],
        })
        stale.board.engineRunning({ run_id: stale.run_id })
        await stale.board.board.checkEngines()
        return [
            { name: 'gone', ...gone },
            { name: 'stale', ...stale },
        ]
    }

    test('the heartbeat is a flat red line, however loud the last seconds were', async () => {
        for (const run of await cases()) {
            const state = await run.board.stateOf({ run_id: run.run_id })
            const { heights, colors } = barsOf({ shown: showCard({ state }) })

            expect([run.name, heights]).toEqual([
                run.name,
                Array.from({ length: 20 }, () => heights[0] ?? 0),
            ])
            expect([run.name, new Set(colors)]).toEqual([
                run.name,
                new Set([THEME.colors.statusDanger]),
            ])
        }
    })

    test('the timers stop: the card reads the same later on, with no tool call counting up', async () => {
        for (const run of await cases()) {
            const state = await run.board.stateOf({ run_id: run.run_id })

            const first = showCard({ state })
            const later = showCard({ state, at: NOW + 30_000 })

            expect(dotsLine({ shown: first })).not.toMatch(/running \d/)
            expect([run.name, tokensLine({ shown: later })]).toEqual([
                run.name,
                tokensLine({ shown: first }),
            ])
        }
    })
})

describe('a long tool call with a live file that is still rewritten (#635)', () => {
    test('shows neither engine not running nor no sign of life, only the call running', async () => {
        const { board, run_id, runs_dir } = await commandLineRun()
        board.engineRunning({ run_id })
        const call = {
            tool: 'Bash',
            target: 'bun test',
            started_at: ago(20 * 60),
        }
        // The engine rewrites the file every 5 seconds, up to the 60-second edge.
        for (const written of [4, 59]) {
            await writeLiveFile({
                runs_dir,
                run_id,
                written_at: ago(written),
                agents: [
                    editing({
                        action: {
                            tool: 'Bash',
                            target: 'bun test',
                            at: call.started_at,
                        },
                        open_call: call,
                        activity: Array.from({ length: 30 }, () => 1),
                    }),
                ],
            })
            await board.board.checkEngines()
            const shown = showCard({ state: await board.stateOf({ run_id }) })

            expect(cardText({ shown })).not.toMatch(GONE)
            expect(cardText({ shown })).not.toMatch(STALE)
            expect(dotsLine({ shown })).toContain('▸ bun test · running 20m 0s')
            const { colors } = barsOf({ shown })
            expect(colors).not.toContain(THEME.colors.statusDanger)
        }

        // The writes stop with the call still open: now it reads as hung.
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(70),
            agents: [
                editing({
                    action: {
                        tool: 'Bash',
                        target: 'bun test',
                        at: call.started_at,
                    },
                    open_call: call,
                }),
            ],
        })
        const hung = showCard({ state: await board.stateOf({ run_id }) })
        expect(dotsLine({ shown: hung })).toContain(
            'no sign of life for 1m 10s'
        )
    })
})

describe('a command-line run no process names, judged by its live file (#635)', () => {
    test('a fresh live file keeps it from being labelled, and the same run with a live file 220 seconds old is labelled', async () => {
        // No `--run-id` on any process: only the live file tells it is alive.
        const { board, run_id, runs_dir } = await commandLineRun()
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(4),
            agents: [editing()],
        })

        await board.board.checkEngines()
        const alive = showCard({ state: await board.stateOf({ run_id }) })

        expect(cardText({ shown: alive })).not.toMatch(GONE)
        expect(cardText({ shown: alive })).not.toMatch(STALE)
        expect(board.spawns).toEqual([])

        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(220),
            agents: [editing()],
        })

        await board.board.checkEngines()
        const gone = showCard({ state: await board.stateOf({ run_id }) })

        expect(dotsLine({ shown: gone })).toContain(
            'engine not running · last sign of life 3m 40s ago'
        )
        expect(board.spawns).toEqual([])
    })
})

describe('runs the plugin started still restart (#635)', () => {
    test('a run the plugin started is restarted as before, while a command-line run beside it is only labelled', async () => {
        const { board, run_id, runs_dir } = await startedRun()
        const outside = OUTSIDE
        await writeJournal({
            runs_dir,
            run_id: outside,
            entries: implementerAtWork(),
        })
        await writeLiveFile({
            runs_dir,
            run_id: outside,
            written_at: ago(220),
            agents: [editing()],
        })
        board.setCommandResult({
            result: unfinishedResult({
                runs: [listed({ run_id }), listed({ run_id: outside })],
            }),
        })

        const summary = await board.board.checkEngines()

        expect(summary).toEqual({ restarted: [run_id], stopped: [] })
        const resumed = board.spawns.slice(1).flatMap((spawn) => spawn.args)
        expect(resumed).toContain(run_id)
        expect(resumed).not.toContain(outside)
        const labelled = showCard({
            state: await board.stateOf({ run_id: outside }),
        })
        expect(dotsLine({ shown: labelled })).toContain(
            'engine not running · last sign of life 3m 40s ago'
        )
        const restarted = showCard({ state: await board.stateOf({ run_id }) })
        expect(cardText({ shown: restarted })).not.toMatch(GONE)
    })
})
