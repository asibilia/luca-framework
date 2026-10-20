import { createElement } from 'react'

import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import {
    ago,
    cardText,
    cleanUpCards,
    look,
    showCard,
    startedRun,
} from './testing/card-fixtures'
import {
    LAYOUT,
    THEME,
    render,
    styleOf,
    type Screen,
} from './testing/render-native'

import { createHarness, type Harness } from '../server/testing/board-harness'
import {
    agentFinished,
    runStarted,
    stamp,
    type Entry,
} from '../server/testing/journal-fixtures'
import {
    intakeOf,
    repoWaitEnded,
    repoWaitStarted,
    stepOff,
    stepOn,
    upToImplementer,
} from '../server/testing/journal-fixtures-waits'
import {
    writeLiveFile,
    type LiveWait,
} from '../server/testing/live-file-fixtures'
import type { BoardState } from '../shared/board-state'

const { RunHeader } = await import('./run-header')

/**
 * Waits inside a step, and the repo wait (#632). A check that waits for a
 * prepare slot or a test slot is in the run's live file while it waits:
 * its card shows the amber bar and what it waits for, then the check's
 * text again once the slot is taken. A run waiting for an earlier run on
 * the same repo (#615) shows a banner with the amber bar, from
 * `repo_wait_started` until `repo_wait_ended`. The panel renders through
 * the stand-ins of `testing/render-native.ts`, from board states the
 * plugin's server builds out of fixture journals and fixture live files.
 */

let harness: Harness | null = null
/** The run headers rendered in the current test. */
const headers: Screen[] = []

afterEach(async () => {
    for (const shown of headers.splice(0)) shown.unmount()
    await harness?.cleanup()
    harness = null
    await cleanUpCards()
})

/** #11's implementer is done, and its checks are running. */
const checksRunning = (): Entry[] => [
    ...intakeOf({ spec: 10, tickets: [{ number: 11 }] }),
    ...upToImplementer({ ticket: 11 }),
    agentFinished({ ticket: 11, role: 'implementer' }),
    stepOff({
        ticket: 11,
        step: 'launch_agent:implementer',
        role: 'implementer',
    }),
    stepOn({ ticket: 11, step: 'run_gates' }),
]

/** The amber bar: a bar drawn in the theme's warning color. */
const hasAmberBar = ({ shown }: { shown: Screen }): boolean =>
    shown
        .all()
        .some(
            (node) =>
                node.type === 'View' &&
                styleOf(node).backgroundColor === THEME.colors.statusWarning
        )

/** #11's check waiting for a slot, for the last 20 seconds. */
const slotWait = (fields: Pick<LiveWait, 'for' | 'in_use' | 'slots'>) => ({
    ticket: 11,
    since: ago(20),
    ...fields,
})

describe('a check waiting for a slot (#632)', () => {
    test('a prepare-slot wait in the live file shows the amber bar and "waiting for a prepare slot (1 of 1 in use)", and the check\'s text once the slot is taken', async () => {
        const { board, run_id, runs_dir } = await startedRun({
            entries: checksRunning(),
        })
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(1),
            waits: [slotWait({ for: 'prepare_slot', in_use: 1, slots: 1 })],
        })

        const waiting = showCard({
            state: await board.stateOf({ run_id }),
            number: 11,
        })
        expect(cardText({ shown: waiting })).toContain(
            'waiting for a prepare slot (1 of 1 in use)'
        )
        expect(cardText({ shown: waiting })).not.toContain('running the checks')
        expect(hasAmberBar({ shown: waiting })).toBe(true)

        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(0),
            waits: [],
        })
        const taken = showCard({
            state: await board.stateOf({ run_id }),
            number: 11,
        })
        expect(cardText({ shown: taken })).toContain('running the checks')
        expect(cardText({ shown: taken })).not.toContain('slot')
        expect(hasAmberBar({ shown: taken })).toBe(false)
    })

    test('a test-slot wait in the live file shows the amber bar and "waiting for a test slot (2 of 2 in use)"', async () => {
        const { board, run_id, runs_dir } = await startedRun({
            entries: checksRunning(),
        })
        await writeLiveFile({
            runs_dir,
            run_id,
            written_at: ago(1),
            waits: [slotWait({ for: 'test_slot', in_use: 2, slots: 2 })],
        })

        const shown = showCard({
            state: await board.stateOf({ run_id }),
            number: 11,
        })

        expect(cardText({ shown })).toContain(
            'waiting for a test slot (2 of 2 in use)'
        )
        expect(hasAmberBar({ shown })).toBe(true)
    })
})

/** An earlier run on the same repo, still going. */
const EARLIER = '20260923t113000z-5b1e0c2a'

/** 12 minutes and 5 seconds. */
const TWELVE_05 = (12 * 60 + 5) * 1000

const showHeader = ({ state }: { state: BoardState }): Screen => {
    const shown = render(
        createElement(RunHeader, {
            state,
            runs: [],
            setPicked: () => undefined,
            layout: LAYOUT,
            ...look(),
        })
    )
    headers.push(shown)
    return shown
}

describe('the repo wait (#632)', () => {
    test('a run in a repo wait shows a banner with the amber bar, "waiting for run <run id> on this repo" and a time that counts up, gone at repo_wait_ended', async () => {
        const started = await createHarness()
        harness = started
        const run = await started.start()
        const entries = [
            runStarted({ spec: 10 }),
            repoWaitStarted({ runs: [{ run_id: EARLIER, spec: 9 }] }),
        ]
        const reply = await started.send({ ...run, entries })
        expect(reply.ok).toBe(true)
        const since = stamp({ entries }).at(-1)?.time ?? ''
        setSystemTime(new Date(Date.parse(since) + TWELVE_05))

        const waiting = showHeader({ state: await started.state() })
        expect(cardText({ shown: waiting })).toContain(
            `waiting for run ${EARLIER} on this repo · 12m`
        )
        expect(hasAmberBar({ shown: waiting })).toBe(true)
        waiting.advance(60_000)
        expect(cardText({ shown: waiting })).toContain(
            `waiting for run ${EARLIER} on this repo · 13m`
        )

        const ended = await started.send({
            ...run,
            first_seq: entries.length + 1,
            entries: [repoWaitEnded()],
        })
        expect(ended.ok).toBe(true)
        const over = showHeader({ state: await started.state() })
        expect(cardText({ shown: over })).not.toContain('on this repo')
        expect(hasAmberBar({ shown: over })).toBe(false)
    })
})
