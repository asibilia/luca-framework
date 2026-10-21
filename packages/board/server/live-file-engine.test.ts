import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { dirs, disk, plugin, writeJournal } from './journal-rebuild-helpers'
import { readLiveFile, type LiveFile } from './live-file'
import {
    intakeOfThree,
    unifiedRateLimit,
    type Entry,
} from './testing/journal-fixtures'
import { agentTurnStarts, testsCommitted } from './ticket-stages-panel-helpers'

import type { AgentLauncher } from '../../engine/src/agents/agent-launcher'
import type { EngineConfig } from '../../engine/src/config/engine-config'
import { createLiveFile, LIVE_FILE } from '../../engine/src/core/live-file'
import type { BoardState } from '../shared/board-state'

/**
 * The live file across the two packages (#628, #631, #632, #634, #636):
 * the engine's own writer (`createLiveFile`) makes `live.json` while a
 * stand-in agent's turn reports its progress, with a helper at work and a
 * check waiting for a test slot; the board's reader (`readLiveFile`, and
 * the plugin's read, which lays the file over the journal's state) must
 * keep every entry of it. The board drops an entry it can't read, so a
 * field renamed on either side shows here, not only as a blank card line.
 */

const RUN_ID = '20260923t120000z-0c11e9a1'

/** #13's implementer at work, from a command-line run. */
const implementerAtWork = (): Entry[] => [
    ...intakeOfThree(),
    ...testsCommitted({ ticket: 13 }),
    ...agentTurnStarts({ ticket: 13, role: 'implementer' }),
]

const CONFIG: EngineConfig = {
    checks: { test: 'bun test', types: 'bunx --bun tsc --noEmit' },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

const AT = new Date().toISOString()

/** The run's first plan reading, as the engine hands it on. */
const READING = {
    ...unifiedRateLimit({
        windows: {
            five_hour: { utilization: 0.13 },
            seven_day: { utilization: 0.42 },
        },
    }),
    arrived_at: AT,
}

/** Whether the board's read of the file has the whole turn in it. */
const complete = (live: LiveFile | null): boolean =>
    live !== null &&
    live.agents.length === 1 &&
    live.waits.length === 1 &&
    live.feed.length === 2 &&
    live.plan_usage !== null

/**
 * Plays #13's implementer's turn through the engine's live file: its
 * progress, then #12's check waiting for a test slot, then, still in the
 * turn, the board's two reads of the file once it has all of it.
 */
const playTurn = async () => {
    const folders = await disk()
    await writeJournal({
        ...folders,
        run_id: RUN_ID,
        entries: implementerAtWork(),
    })
    const board = await plugin(folders)
    const live = createLiveFile({
        file: join(folders.runs_dir, RUN_ID, LIVE_FILE),
    })
    const seen: { file: LiveFile | null; state: BoardState | null } = {
        file: null,
        state: null,
    }
    const stand_in: AgentLauncher = {
        launch: async ({ on_progress }) => {
            on_progress?.({
                tokens: 2500,
                action: { tool: 'Edit', target: 'src/gate-runner.ts', at: AT },
                open_call: { tool: 'Bash', target: 'bun test', started_at: AT },
                helpers: [
                    {
                        model: 'haiku',
                        action: { tool: 'Grep', target: 'createSlots', at: AT },
                        done: false,
                    },
                ],
                rate_limit_events: [READING],
            })
            const taken = live.slotWaits({ ticket: 12 })({
                for: 'test_slot',
                in_use: 2,
                slots: 2,
            })
            const deadline = Date.now() + 1800
            while (Date.now() < deadline && !complete(seen.file)) {
                await Bun.sleep(20)
                seen.file = await readLiveFile({
                    runs_dir: folders.runs_dir,
                    run_id: RUN_ID,
                })
            }
            seen.state = await board.stateOf({ run_id: RUN_ID })
            taken()
            return { ok: true, session_id: 's-13', structured_output: {} }
        },
        followUp: async () => ({ ok: false, failure: 'engine', error: 'none' }),
        closeSession: async () => undefined,
    }

    await live.launcher(stand_in).launch({
        role: 'implementer',
        ticket: 13,
        prompt: 'Build ticket #13.',
        cwd: folders.runs_dir,
        may_edit_tests: false,
        config: CONFIG,
        messaging: null,
        model: 'opus',
        effort: 'medium',
    })
    live.close()
    return seen
}

afterEach(async () => {
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

describe("the engine's live file, read by the board", () => {
    test('every agent, helper, slot wait, feed entry and the plan reading the engine writes survives the board reading it', async () => {
        const { file, state } = await playTurn()

        expect(complete(file)).toBe(true)
        expect(file?.agents[0]).toMatchObject({
            ticket: 13,
            role: 'implementer',
            model: 'opus',
            tokens: 2500,
            action: { tool: 'Edit', target: 'src/gate-runner.ts', at: AT },
            open_call: { tool: 'Bash', target: 'bun test', started_at: AT },
            helpers: [
                {
                    model: 'haiku',
                    action: { tool: 'Grep', target: 'createSlots', at: AT },
                    done: false,
                },
            ],
        })
        expect(file?.agents[0]?.activity).toHaveLength(30)
        expect(file?.agents[0]?.activity.some((count) => count > 0)).toBe(true)
        expect(file?.waits).toEqual([
            {
                ticket: 12,
                for: 'test_slot',
                in_use: 2,
                slots: 2,
                since: expect.any(String),
            },
        ])
        expect(file?.feed).toEqual([
            {
                at: AT,
                ticket: 13,
                role: 'implementer',
                model: 'opus',
                tool: 'Edit',
                target: 'src/gate-runner.ts',
            },
            {
                at: AT,
                ticket: 13,
                role: 'helper',
                model: 'haiku',
                tool: 'Grep',
                target: 'createSlots',
            },
        ])

        const card = (number: number) =>
            state?.tickets.find((ticket) => ticket.number === number)
        expect(card(13)?.live).toEqual(file?.agents[0] ?? null)
        expect(card(12)?.slot_wait).toEqual(file?.waits[0] ?? null)
        expect(state?.feed).toEqual(file?.feed ?? [])
        expect(state?.usage).toMatchObject({
            five_hour_percent: 13,
            weekly_percent: 42,
        })
    })
})
