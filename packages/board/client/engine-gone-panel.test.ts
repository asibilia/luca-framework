import { createElement } from 'react'

import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import {
    NOW,
    ago,
    barsOf,
    cardText,
    cleanUpCards,
    dotsLine,
    editing,
    heartbeatOf,
    implementerAtWork,
    look,
    showCard,
    startedRun,
} from './testing/card-fixtures'
import {
    LAYOUT,
    THEME,
    render,
    styleOf,
    textOf,
    type Screen,
} from './testing/render-native'

import { listed } from '../server/engine-restart-helpers'
import { disk, plugin, writeJournal } from '../server/journal-rebuild-helpers'
import { unfinishedResult } from '../server/testing/board-harness'
import { entry } from '../server/testing/journal-fixture-base'
import { runStarted, type Entry } from '../server/testing/journal-fixtures'
import {
    intakeOf,
    repoWaitStarted,
    stepOn,
    ticketWaiting,
    worktreeReady,
} from '../server/testing/journal-fixtures-waits'
import {
    writeLiveFile,
    type LiveAgent,
} from '../server/testing/live-file-fixtures'
import type { BoardState } from '../shared/board-state'

const { RunHeader } = await import('./run-header')

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

/** #13's implementer, four seconds before the oldest live file's write. */
const loud = (fields: Partial<LiveAgent> = {}): LiveAgent =>
    editing({
        action: { tool: 'Edit', target: 'gate-runner.ts', at: ago(224) },
        // Loud activity, so a red flat line can't be mistaken for a quiet one.
        activity: Array.from({ length: 30 }, () => 8),
        ...fields,
    })

afterEach(cleanUpCards)

const OUTSIDE = '20260923t120000z-0c11e9a1'

/** A run the plugin didn't start, with a journal of `entries` (#13 at work, unless told). */
const commandLineRun = async ({
    entries = implementerAtWork(),
}: { entries?: Entry[] } = {}) => {
    const folders = await disk()
    await writeJournal({ ...folders, run_id: OUTSIDE, entries })
    const board = await plugin(folders)
    return { board, run_id: OUTSIDE, runs_dir: folders.runs_dir }
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

/** The heights and colours of a card's heartbeat bars, left to right. */
const beatOf = ({
    shown,
}: {
    shown: Screen
}): { heights: number[]; colors: unknown[] } => {
    const beat = heartbeatOf({ shown })
    if (beat === null) throw new Error('no heartbeat')
    const bars = barsOf({ beat })
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
            agents: [loud()],
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
            agents: [loud()],
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
                loud({
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
                loud({
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
            const { heights, colors } = beatOf({ shown: showCard({ state }) })

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

/** The amber bar: a bar drawn in the theme's warning color. */
const hasAmberBar = ({ shown }: { shown: Screen }): boolean =>
    shown
        .all()
        .some(
            (node) =>
                node.type === 'View' &&
                styleOf(node).backgroundColor === THEME.colors.statusWarning
        )

/** The run header of `state`, rendered at `NOW`. */
const showHeader = ({ state }: { state: BoardState }): Screen => {
    setSystemTime(new Date(NOW))
    return render(
        createElement(RunHeader, {
            state,
            runs: [],
            setPicked: () => undefined,
            layout: LAYOUT,
            ...look(),
        })
    )
}

/** The texts on `shown` with the last sign of life's age, which goes on counting, left out. */
const stillText = ({ shown }: { shown: Screen }): string =>
    cardText({ shown }).replace(/last sign of life .+? ago/g, 'last sign')

/** A command-line run whose engine is gone, last alive 220 seconds ago. */
const goneRun = async ({ entries }: { entries: Entry[] }) => {
    const run = await commandLineRun({ entries })
    await writeLiveFile({
        runs_dir: run.runs_dir,
        run_id: run.run_id,
        written_at: ago(220),
    })
    await run.board.board.checkEngines()
    return run.board.stateOf({ run_id: run.run_id })
}

/** An earlier run on the same repo. */
const EARLIER = '20260923t113000z-5b1e0c2a'

describe('waits in a run with no sign of life (#635)', () => {
    test('a card waiting between steps reads "engine not running" in place of its wait, with no amber look, a flat red heartbeat, and stopped timers', async () => {
        const state = await goneRun({
            entries: [
                ...intakeOf({
                    spec: 10,
                    tickets: [{ number: 11 }, { number: 12 }],
                }),
                ...worktreeReady({ ticket: 11 }),
                ...worktreeReady({ ticket: 12 }),
                stepOn({ ticket: 11, step: 'run_baseline_tests' }),
                ticketWaiting({
                    ticket: 12,
                    waiting_for: 'baseline',
                    on_ticket: 11,
                    since: ago(600),
                }),
            ],
        })

        const shown = showCard({ state, number: 12 })
        expect(dotsLine({ shown })).toContain(
            'engine not running · last sign of life 3m 40s ago'
        )
        expect(cardText({ shown })).not.toContain('baseline tests')
        expect(
            shown
                .all()
                .some(
                    (node) => node.type === 'Text' && textOf(node) === 'waiting'
                )
        ).toBe(false)
        expect(hasAmberBar({ shown })).toBe(false)
        const { heights, colors } = beatOf({ shown })
        expect(heights).toEqual(
            Array.from({ length: 20 }, () => heights[0] ?? 0)
        )
        expect(new Set(colors)).toEqual(new Set([THEME.colors.statusDanger]))
        const later = showCard({ state, number: 12, at: NOW + 30_000 })
        expect(stillText({ shown: later })).toBe(stillText({ shown }))
    })

    test('the header\'s "Now:" step line stops counting at the last sign of life', async () => {
        const state = await goneRun({
            entries: [
                ...intakeOf({ spec: 10, tickets: [{ number: 11 }] }),
                entry({
                    kind: 'step_started',
                    content: {
                        key: 'final',
                        step: 'run_final_gates',
                        first_seq: null,
                    },
                }),
            ],
        })

        const header = showHeader({ state })
        const before = cardText({ shown: header })
        // From the step's start (12:00:06) to the last sign of life (12:27:20).
        expect(before).toContain('Now: running the checks (27m 14s)')
        header.advance(30_000)
        expect(cardText({ shown: header })).toContain(
            'Now: running the checks (27m 14s)'
        )
        header.unmount()
    })

    test('the repo-wait banner says the engine is not running, with no amber bar, and its time stops at the last sign of life', async () => {
        const state = await goneRun({
            entries: [
                runStarted({ spec: 10 }),
                repoWaitStarted({ runs: [{ run_id: EARLIER, spec: 9 }] }),
            ],
        })

        const header = showHeader({ state })
        const shown = cardText({ shown: header })
        // From the wait's start (12:00:02) to the last sign of life (12:27:20).
        expect(shown).toContain(
            `waiting for run ${EARLIER} on this repo · 27m 18s`
        )
        expect(shown).toContain(
            'engine not running · last sign of life 3m 40s ago'
        )
        expect(hasAmberBar({ shown: header })).toBe(false)
        const before = stillText({ shown: header })
        header.advance(60_000)
        expect(stillText({ shown: header })).toBe(before)
        header.unmount()
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
                    loud({
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
            const { colors } = beatOf({ shown })
            expect(colors).not.toContain(THEME.colors.statusDanger)
        }

        // The writes stop with the call still open: now it reads as hung.
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(70),
            agents: [
                loud({
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
            agents: [loud()],
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
            agents: [loud()],
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
            agents: [loud()],
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
