import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    ago,
    barsOf,
    cardText,
    cleanUpCards,
    dotsLine,
    editing,
    heartbeatOf,
    implementerAtWork,
    showCard,
    startedRun,
    stepDotsOf,
} from './testing/card-fixtures'
import { THEME, styleOf, type HostNode } from './testing/render-native'

import { disk, plugin, writeJournal } from '../server/journal-rebuild-helpers'
import { unifiedRateLimit } from '../server/testing/journal-fixtures'
import {
    removeLiveFile,
    writeLiveFile,
} from '../server/testing/live-file-fixtures'

const { tokensText } = await import('./board-look')

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

afterEach(cleanUpCards)

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
        expect(cardText({ shown })).not.toContain('waiting for the implementer')
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
        const first = cardText({
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
        const later = cardText({
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
        expect(cardText({ shown })).toContain('waiting for the implementer')
        expect(cardText({ shown })).not.toContain('✎')
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

/**
 * The heartbeat (#631): at the end of a busy card's step-dots line, a `View`
 * labelled "Heartbeat" whose children are 20 bar `View`s, oldest on the
 * left. Each bar has a numeric `height` and a `backgroundColor`. The bars
 * are the newest 20 of the agent's 30 activity counts in the live file
 * (`activity`, oldest first): a taller bar for a bigger count, in the
 * theme's success colour while working; a flat line (all bars one height)
 * in the muted colour when nothing happened in those seconds.
 */
const BARS = 20

const heightsOf = ({ beat }: { beat: HostNode }): number[] =>
    barsOf({ beat }).map((bar) => Number(styleOf(bar).height))

const colorsOf = ({ beat }: { beat: HostNode }): unknown[] =>
    barsOf({ beat }).map((bar) => styleOf(bar).backgroundColor)

/** A 30-second activity: `recent` (the newest seconds) after older seconds of `before`. */
const activityOf = ({
    before,
    recent,
}: {
    before: number
    recent: number[]
}): number[] => [
    ...Array.from({ length: 30 - recent.length }, () => before),
    ...recent,
]

describe('the heartbeat on busy cards (#631)', () => {
    test("a working card's 20 bars follow the newest 20 activity counts, taller for more, in green", async () => {
        const { board, run_id, runs_dir } = await startedRun({
            entries: implementerAtWork(),
        })
        const recent = [
            0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
        ]
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(1),
            // The oldest 10 seconds are loud and must not show.
            agents: [editing({ activity: activityOf({ before: 40, recent }) })],
        })

        const shown = showCard({ state: await board.stateOf({ run_id }) })

        const beat = heartbeatOf({ shown })
        expect(beat).not.toBeNull()
        if (beat === null) return
        // At the end of the step-dots line.
        expect(beat.parent).toBe(stepDotsOf({ shown }).parent)
        const heights = heightsOf({ beat })
        const colors = colorsOf({ beat })
        expect(heights).toHaveLength(BARS)
        for (const [index, height] of heights.entries()) {
            expect(Number.isFinite(height)).toBe(true)
            if (index > 0) {
                expect(height).toBeGreaterThanOrEqual(heights[index - 1] ?? 0)
            }
        }
        // Equal counts, equal bars; more activity, a taller bar.
        expect(heights[5]).toBe(heights[6])
        expect(heights[7]).toBe(heights[8])
        expect(heights[5]).toBeGreaterThan(heights[0] ?? 0)
        expect(heights[19]).toBeGreaterThan(heights[5] ?? 0)
        for (const index of [5, 10, 15, 19]) {
            expect(colors[index]).toBe(THEME.colors.statusSuccess)
        }
    })

    test('with no activity in those seconds, no tokens and no open tool call, the bars are a flat line in the muted colour', async () => {
        const { board, run_id, runs_dir } = await startedRun({
            entries: implementerAtWork(),
        })
        const flat = async (activity: number[]) => {
            await writeLiveFile({
                runs_dir,
                run_id,
                written_at: ago(1),
                agents: [editing({ activity })],
            })
            const shown = showCard({ state: await board.stateOf({ run_id }) })
            const beat = heartbeatOf({ shown })
            expect(beat).not.toBeNull()
            if (beat === null) return
            const heights = heightsOf({ beat })
            expect(heights).toHaveLength(BARS)
            expect(new Set(heights).size).toBe(1)
            expect(new Set(colorsOf({ beat }))).toEqual(
                new Set([THEME.colors.foregroundMuted])
            )
        }

        await flat(Array.from({ length: 30 }, () => 0))
        // Older seconds that were busy don't count: the bars are the newest 20.
        await flat(activityOf({ before: 9, recent: Array(20).fill(0) }))
    })

    test('a done, skipped, stuck or blocked card has no heartbeat, even with a live entry', async () => {
        const { board, run_id, runs_dir } = await startedRun({
            entries: implementerAtWork(),
        })
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(1),
            agents: [editing({ activity: Array(30).fill(3) })],
        })
        const state = await board.stateOf({ run_id })
        const busy = showCard({ state })
        expect(heartbeatOf({ shown: busy })).not.toBeNull()

        for (const stage of ['done', 'skipped', 'stuck', 'blocked'] as const) {
            const shown = showCard({
                state: {
                    ...state,
                    tickets: state.tickets.map((card) =>
                        card.number === 13 ? { ...card, stage } : card
                    ),
                },
            })
            expect([stage, heartbeatOf({ shown })]).toEqual([stage, null])
        }
    })
})
