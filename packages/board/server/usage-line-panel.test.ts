import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    intakeOfThree,
    limitWaitStarted,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

import { EngineSettingsSchema } from '../shared/engine-settings'

/**
 * Seam 3 for the usage line (#434): the plugin's two usage-line settings,
 * and a run paused at the usage line as `board.read` shows it. The engine
 * journals the pause as `usage_line_wait_started` (the window, the line, the
 * reading's percent, the window's reset, and when it wakes) and its end as
 * `usage_line_wait_ended` (`reason`: `reset` or `line_raised`).
 */

let harness: Harness | null = null

afterEach(async () => {
    await harness?.cleanup()
    harness = null
})

const RESETS_AT = '2026-09-26T11:00:00.000Z'

const usageLineWaitStarted = ({
    window,
    line,
    percent,
}: {
    window: string
    line: number
    percent: number
}): Entry => ({
    kind: 'usage_line_wait_started',
    ticket: null,
    role: null,
    content: {
        window,
        line,
        percent,
        resets_at: RESETS_AT,
        until: '2026-09-26T11:01:00.000Z',
    },
})

const usageLineWaitEnded = ({ reason }: { reason: string }): Entry => ({
    kind: 'usage_line_wait_ended',
    ticket: null,
    role: null,
    content: { until: '2026-09-26T11:01:00.000Z', reason },
})

/** Starts a run and sends intake plus `entries` in one go. */
const runWith = async ({ entries }: { entries: Entry[] }) => {
    const board = await createHarness()
    harness = board
    const { run_id, token } = await board.start()
    const reply = await board.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
    return { board, run_id, token, next: reply.next_seq }
}

describe('the usage-line settings', () => {
    test('the weekly line defaults to 80 and the 5-hour line to 85', () => {
        expect(EngineSettingsSchema.parse({})).toMatchObject({
            weekly_line: 80,
            five_hour_line: 85,
        })
    })

    test('settings saved before the usage lines still read, with the default lines', () => {
        expect(
            EngineSettingsSchema.parse({
                engine_path: '/opt/luca/packages/engine/src/cli/luca-run.ts',
                bun_path: '',
            })
        ).toEqual({
            engine_path: '/opt/luca/packages/engine/src/cli/luca-run.ts',
            bun_path: '',
            weekly_line: 80,
            five_hour_line: 85,
        })
    })

    test('a raised or lowered line is kept', () => {
        expect(
            EngineSettingsSchema.parse({ weekly_line: 90, five_hour_line: 70 })
        ).toMatchObject({ weekly_line: 90, five_hour_line: 70 })
    })
})

describe('a run paused at the usage line', () => {
    test('shows its own paused state naming the weekly line, not a plan limit wait', async () => {
        const { board } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                usageLineWaitStarted({
                    window: 'seven_day',
                    line: 80,
                    percent: 82,
                }),
            ],
        })

        const state = await board.state()
        expect(state.run.status).toBe('usage_line_wait')
        expect(state.limit_wait).toBeNull()
        expect(state.usage_line_wait).toMatchObject({
            window: 'weekly',
            line: 80,
            percent: 82,
            resets_at: RESETS_AT,
        })
    })

    test('names the five-hour line when that is the one reached', async () => {
        const { board } = await runWith({
            entries: [
                usageLineWaitStarted({
                    window: 'five_hour',
                    line: 85,
                    percent: 87,
                }),
            ],
        })

        expect((await board.state()).usage_line_wait).toMatchObject({
            window: 'five-hour',
            line: 85,
            percent: 87,
        })
    })

    test('the paused state clears when the run carries on', async () => {
        const { board, run_id, token, next } = await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                usageLineWaitStarted({
                    window: 'seven_day',
                    line: 80,
                    percent: 82,
                }),
            ],
        })

        await board.send({
            run_id,
            token,
            first_seq: next,
            entries: [usageLineWaitEnded({ reason: 'line_raised' })],
        })

        const state = await board.state()
        expect(state.usage_line_wait).toBeNull()
        expect(state.run.status).toBe('building')
    })

    test('a plan limit wait still shows as a plan limit wait, with no usage-line pause', async () => {
        const { board } = await runWith({
            entries: [limitWaitStarted({ resets_at: RESETS_AT })],
        })

        const state = await board.state()
        expect(state.run.status).toBe('limit_wait')
        expect(state.limit_wait).toMatchObject({ window: 'five-hour' })
        expect(state.usage_line_wait).toBeNull()
    })
})

describe('the board README', () => {
    test('its Settings section explains the two usage lines', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', 'README.md')
        ).text()
        const start = readme.indexOf('\n## Settings')
        expect(start).toBeGreaterThan(-1)
        const rest = readme.slice(start + 1)
        const next = rest.indexOf('\n## ')
        const section = next === -1 ? rest : rest.slice(0, next)
        expect(section).toContain('weekly_line')
        expect(section).toContain('five_hour_line')
        expect(section).toContain('usage line')
    })
})
