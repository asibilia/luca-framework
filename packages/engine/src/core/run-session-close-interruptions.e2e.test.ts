import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    byId,
    callsOf,
    closedIn,
    closeOf,
    expectEveryoneClosed,
    launchedBy,
    scriptedWith,
    wrongImplementer,
} from './run-session-close-helpers'

import {
    AgentSessionSchema,
    type AgentLauncher,
} from '../agents/agent-launcher'
import {
    createScriptedLauncher,
    type ScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import type { Journal } from '../journal/journal'
import type { EngineClock } from '../limits/limit-wait'
import { rateLimitReading } from '../testing/build-fixtures'
import {
    createPracticeRepo,
    happyTurns,
    practiceTracker,
} from '../testing/practice-repo'

/**
 * Seam 2 for closing finished agents' sessions (#409), a run interrupted: a
 * launcher's stop, a billing stop, a limit wait, and a crash-recovery redo.
 * The clean run and the fix rounds are in `run-session-close.e2e.test.ts`,
 * the tickets that end early in `run-session-close-ticket-ends.e2e.test.ts`,
 * and the helpers they share are in `run-session-close-helpers.ts`.
 */

let root = ''

/** A fresh `root` for each test of the describe it is called in. */
const rootPerTest = () => {
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-session-close-'))
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })
}

/** The test-writer's first turn, cut off by the plan with these readings. */
const cutOff = (
    rate_limit_events: Record<string, unknown>[]
): ScriptedTurn => ({
    role: 'test-writer',
    ticket: 11,
    failure: 'plan',
    error: 'The plan said no.',
    session: AgentSessionSchema.parse({
        session_id: 'cut-1',
        rate_limit_events,
    }),
})

/** A clock that moves only when slept. */
const fakeClock = (start: string): EngineClock => {
    let now = Date.parse(start)
    return {
        now: () => now,
        sleep: async (ms) => {
            now += ms
        },
    }
}

/**
 * A launcher and a journal wrapper for an engine killed mid follow-up: the
 * follow-up throws, and from then on the dead engine closes nothing and
 * journals nothing, so the journal stays as a killed process leaves it.
 */
const killedOnFollowUp = (launcher: AgentLauncher) => {
    let dead = false
    const die = () => {
        dead = true
        throw new Error('The engine crashed.')
    }
    return {
        launcher: {
            launch: (args) => launcher.launch(args),
            followUp: async () => die(),
            closeSession: async (args) =>
                dead ? die() : launcher.closeSession(args),
        } satisfies AgentLauncher,
        journal: (real: Journal): Journal => ({
            ...real,
            append: (entry) => (dead ? die() : real.append(entry)),
        }),
    }
}

describe('sessions close on every other way a step ends, end to end', () => {
    rootPerTest()

    test("a launcher's stop closes the session it stopped in, and every other", async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter } = happyTurns()
        const launcher = scriptedWith([
            testWriter,
            {
                role: 'implementer',
                ticket: 11,
                failure: 'stop',
                error: 'The account is on the wrong plan.',
            },
        ])

        await expect(practice.run({ launcher })).rejects.toThrow(
            'Run stopped: The account is on the wrong plan.'
        )

        expect(launchedBy(launcher).map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
        ])
        expectEveryoneClosed({ launcher, records: practice.journal.read() })
    }, 60_000)

    test('a billing stop closes the cut-off agent’s session', async () => {
        const practice = await createPracticeRepo({ root })
        const launcher = scriptedWith([
            cutOff([
                rateLimitReading({ status: 'allowed', is_using_overage: true }),
            ]),
        ])

        const { action, records } = await practice.run({
            launcher,
            clock: fakeClock('2026-09-23T12:00:00.000Z'),
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'stopped' })
        expect(launchedBy(launcher).map(({ role }) => role)).toEqual([
            'test-writer',
        ])
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test('a limit wait closes the cut-off agent’s session before a fresh agent replaces it', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        const seen: Record<string, string[]> = {}
        const launcher: ScriptedLauncher = scriptedWith([
            cutOff([
                rateLimitReading({
                    status: 'rejected',
                    rate_limit_type: 'five_hour',
                    resets_at: '2026-09-23T14:00:00.000Z',
                }),
            ]),
            {
                ...testWriter,
                act: async () => {
                    seen.replacement = launcher.openSessions()
                },
            },
            implementer,
            reviewer,
        ])

        const { action, records } = await practice.run({
            launcher,
            tracker: practiceTracker(),
            clock: fakeClock('2026-09-23T12:00:00.000Z'),
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [cut, replacement] = callsOf(launcher, 11)
        expect(replacement?.kind).toBe('launch')
        expect(replacement?.session_id).not.toBe(cut?.session_id ?? '')
        expect(seen.replacement).toEqual([replacement?.session_id ?? ''])
        expect(closeOf(records, cut?.session_id ?? '')).toMatchObject({
            ticket: 11,
            role: 'test-writer',
        })
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test("a crash-recovery redo closes the cut-off turn's session and journals it once", async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        const crashed = createScriptedLauncher({
            turns: [testWriter, wrongImplementer(11)],
        })
        const killed = killedOnFollowUp(crashed)

        await expect(
            practice.run({ launcher: killed.launcher, journal: killed.journal })
        ).rejects.toThrow('The engine crashed.')
        const cutOffCoder = crashed
            .launches()
            .find(({ role }) => role === 'implementer')
        if (cutOffCoder === undefined) throw new Error('no implementer')
        // As a killed engine leaves it: the cut-off turn's session is open.
        const before = practice.journal.read()
        const cutStep = before.findLast(({ kind }) => kind === 'step_started')
        expect(cutStep).toMatchObject({
            content: {
                key: '11',
                step: 'follow_up_agent:implementer',
                first_seq: null,
            },
        })
        expect(
            before.some(
                ({ kind, seq }) =>
                    kind === 'step_ended' && seq > (cutStep?.seq ?? 0)
            )
        ).toBe(false)
        expect(closeOf(before, cutOffCoder.session_id)).toBeUndefined()

        const resumed = scriptedWith([implementer, reviewer])
        const { action } = await practice.run({
            resume: true,
            launcher: resumed,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const records = practice.journal.read()
        const resumes = records.filter(({ kind }) => kind === 'run_resumed')
        expect(resumes).toHaveLength(1)
        const [resumedAt] = resumes
        const redo = records.find(
            (record) =>
                record.seq > (resumedAt?.seq ?? 0) &&
                record.kind === 'agent_started' &&
                record.role === 'implementer'
        )
        const close = closeOf(records, cutOffCoder.session_id)
        expect(close).toMatchObject({ ticket: 11, role: 'implementer' })
        // The redo closes it, before the fresh implementer starts.
        expect(close?.seq ?? 0).toBeGreaterThan(resumedAt?.seq ?? Infinity)
        expect(close?.seq ?? Infinity).toBeLessThan(redo?.seq ?? 0)
        expect(resumed.openSessions()).toEqual([])
        expect(closedIn(records)).toEqual(
            [...launchedBy(crashed), ...launchedBy(resumed)].toSorted(byId)
        )

        // The restart journaled the cut-off step first, and redid it as a
        // fresh launch, not a follow-up; every step it started, it saw end.
        expect(resumedAt).toMatchObject({
            seq: before.length + 1,
            content: {
                interrupted: [
                    {
                        key: '11',
                        step: 'follow_up_agent:implementer',
                        ticket: 11,
                        role: 'implementer',
                        started_seq: cutStep?.seq,
                        first_seq: null,
                    },
                ],
            },
        })
        expect(
            resumed.launches().some(({ kind }) => kind === 'follow_up')
        ).toBe(false)
        const after = records.slice(before.length)
        const count = (kind: string) =>
            after.filter((record) => record.kind === kind).length
        expect(count('step_started')).toBe(count('step_ended'))
    }, 90_000)
})
