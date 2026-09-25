import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { MAX_FIX_ROUNDS } from './loop-caps'

import {
    AgentSessionSchema,
    type AgentLauncher,
} from '../agents/agent-launcher'
import { lensRole, type LensName } from '../agents/role-results'
import {
    createScriptedLauncher,
    type ScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun, type RunState } from '../journal/replay'
import type { EngineClock } from '../limits/limit-wait'
import { rateLimitReading } from '../testing/build-fixtures'
import { createFakeMuninn } from '../testing/fake-muninn'
import { SPEC_OWNER, specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    CLEAN_LENS_TURNS,
    createPracticeRepo,
    EMPTY_LEARNER_TURN,
    happyTurns,
    IMPLEMENTER_RESULT,
    practiceTracker,
    SUM,
    SUM_TEST,
} from '../testing/practice-repo'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Seam 2 for closing finished agents' sessions (#409): whole runs on the
 * practice repo with the scripted launcher, which counts the sessions still
 * open. However a step ends, no finished agent's session is left open, each
 * close is journaled once, and same-session fix rounds still reuse theirs.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-session-close-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/**
 * A scripted launcher with these turns, then a clean final review of spec
 * #10 and an empty learner to fall back on.
 */
const scriptedWith = (turns: ScriptedTurn[]): ScriptedLauncher =>
    createScriptedLauncher({
        turns: [...turns, ...CLEAN_LENS_TURNS(10), EMPTY_LEARNER_TURN(10)],
    })

type SessionOf = { role: string | null; session_id: string }

const byId = (a: SessionOf, b: SessionOf) =>
    a.session_id.localeCompare(b.session_id)

/** Every session a scripted launcher started, with its agent's role. */
const launchedBy = (launcher: ScriptedLauncher): SessionOf[] =>
    launcher
        .launches()
        .filter(({ kind }) => kind === 'launch')
        .map(({ role, session_id }) => ({ role, session_id }))

/** Every session close the journal records, with its agent's role. */
const closedIn = (records: JournalRecord[]): SessionOf[] =>
    records
        .flatMap((record) =>
            record.kind === 'agent_session_closed'
                ? [{ role: record.role, session_id: record.content.session_id }]
                : []
        )
        .toSorted(byId)

/** The journal's close of `session_id`, if any. */
const closeOf = (records: JournalRecord[], session_id: string) =>
    records.find(
        (record) =>
            record.kind === 'agent_session_closed' &&
            record.content.session_id === session_id
    )

/**
 * No session the launcher started is still open, and the journal records
 * each one's close exactly once.
 */
const expectEveryoneClosed = ({
    launcher,
    records,
}: {
    launcher: ScriptedLauncher
    records: JournalRecord[]
}) => {
    expect(launcher.openSessions()).toEqual([])
    expect(closedIn(records)).toEqual(launchedBy(launcher).toSorted(byId))
}

/** A ticket's launches and follow-ups, in order. */
const callsOf = (launcher: ScriptedLauncher, ticket: number) =>
    launcher.launches().filter((call) => call.ticket === ticket)

/** A sum test that defines sum itself, so it passes before any code exists. */
const PASSING_SUM_TEST = SUM_TEST.replace(
    "import { sum } from './sum'",
    'const sum = ({ numbers }: { numbers: number[] }) =>\n    numbers.reduce((a, b) => a + b, 0)'
)

const RENAMED_SUM = `export const sum = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce((running, each) => running + each, 0)
`

/** An implementer of `ticket` whose code fails the tests. */
const wrongImplementer = (ticket: number): ScriptedTurn => ({
    role: 'implementer',
    ticket,
    files: {
        'src/sum.ts': 'export const sum = (): number => 42\n',
        'src/index.ts': "export { sum } from './sum'\n",
    },
    result: IMPLEMENTER_RESULT,
})

/** A lens turn of spec #10 with these findings (none: it approves). */
const lensTurn = ({
    lens,
    findings,
}: {
    lens: LensName
    findings?: object[]
}): ScriptedTurn => ({
    role: lensRole({ lens }),
    ticket: 10,
    result: {
        verdict: (findings ?? []).length > 0 ? 'changes_requested' : 'approve',
        findings: findings ?? [],
        rulings: [],
        summary: `The ${lens} lens looked.`,
        assumptions: [],
    },
})

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

/** A launcher whose follow-ups throw, as if the engine died mid-turn. */
const crashingOnFollowUp = (launcher: AgentLauncher): AgentLauncher => ({
    launch: (args) => launcher.launch(args),
    followUp: () => Promise.reject(new Error('The engine crashed.')),
    closeSession: (args) => launcher.closeSession(args),
})

/** Spec #10, owned by `SPEC_OWNER`, with these tickets. */
const trackerWith = (tickets: ReturnType<typeof ticketIssue>[]) =>
    createInMemoryTracker({
        issues: [specIssue({ number: 10 }), ...tickets],
        sub_tickets: { 10: tickets.map(({ number }) => number) },
        engine_login: SPEC_OWNER,
    })

const SUM_CRITERIA = ['sum adds two numbers', 'sum of no numbers is zero']

/**
 * A clock whose every wait lets the spec owner act once `when` holds for
 * the run's state. Waits yield briefly for real, so tickets building
 * meanwhile make progress.
 */
const ownerClock = ({
    journal,
    when,
    act,
}: {
    journal: Journal
    when: (state: RunState) => boolean
    act: () => void
}): EngineClock => {
    let acted = false
    return {
        now: () => Date.now(),
        sleep: async () => {
            await Bun.sleep(5)
            if (acted) return
            if (!when(replayRun({ records: journal.read() }))) return
            acted = true
            act()
        },
    }
}

describe('finished agents’ sessions close, end to end', () => {
    test('a clean run leaves no session open, and the journal records each close once', async () => {
        const practice = await createPracticeRepo({ root })
        const launcher = scriptedWith(Object.values(happyTurns()))

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(launchedBy(launcher).length).toBeGreaterThanOrEqual(8)
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test("the test-writer's session closes with the red commit, the implementer's with the green commit, and the reviewer's once its review is ruled on", async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        const seen: Record<string, string[]> = {}
        const [firstLens] = CLEAN_LENS_TURNS(10)
        if (firstLens === undefined) throw new Error('lenses')
        const launcher: ScriptedLauncher = scriptedWith([
            testWriter,
            {
                ...implementer,
                act: async () => {
                    seen.implementer = launcher.openSessions()
                },
            },
            {
                ...reviewer,
                act: async () => {
                    seen.reviewer = launcher.openSessions()
                },
            },
            {
                ...firstLens,
                act: async () => {
                    seen.lens = launcher.openSessions()
                },
            },
        ])

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [writer, coder, review] = callsOf(launcher, 11)
        if (!writer || !coder || !review) throw new Error('three calls')
        // Only the agent at work is open; the ones before it closed.
        expect(seen.implementer).toEqual([coder.session_id])
        expect(seen.reviewer).toEqual([review.session_id])
        const ticketSessions = [writer, coder, review].map(
            ({ session_id }) => session_id
        )
        expect(seen.lens?.length ?? 0).toBeGreaterThan(0)
        expect(
            (seen.lens ?? []).filter((id) => ticketSessions.includes(id))
        ).toEqual([])

        // The journal says when: after the step's result was accepted.
        const green = records.find(
            (record) =>
                record.kind === 'commit_made' &&
                record.content.stage === 'green'
        )
        const coderClosed = closeOf(records, coder.session_id)
        expect(coderClosed).toMatchObject({ ticket: 11, role: 'implementer' })
        expect(coderClosed?.seq ?? 0).toBeGreaterThan(green?.seq ?? Infinity)
        const ruled = records.find(
            (record) =>
                record.kind === 'agent_finished' &&
                record.role === 'ticket-reviewer'
        )
        const reviewClosed = closeOf(records, review.session_id)
        expect(reviewClosed).toMatchObject({
            ticket: 11,
            role: 'ticket-reviewer',
        })
        expect(reviewClosed?.seq ?? 0).toBeGreaterThan(ruled?.seq ?? Infinity)
        expect(closeOf(records, writer.session_id)).toMatchObject({
            ticket: 11,
            role: 'test-writer',
        })
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test('same-session fix rounds reuse their open session until the loop is over, and a bounced agent’s session closes', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        const seen: Record<string, string[]> = {}
        const launcher: ScriptedLauncher = scriptedWith([
            // 1. The first test's already passes: the red check fails.
            { ...testWriter, files: { 'src/sum.test.ts': PASSING_SUM_TEST } },
            // 2. Its follow-up, in the same session, expects 1 + 2 to be 4.
            {
                ...testWriter,
                files: {
                    'src/sum.test.ts': SUM_TEST.replace('toBe(3)', 'toBe(4)'),
                },
                act: async () => {
                    seen.writerFix = launcher.openSessions()
                },
            },
            // 3. The implementer calls that test bad.
            {
                role: 'implementer',
                ticket: 11,
                files: { 'src/sum.ts': SUM },
                result: {
                    ...IMPLEMENTER_RESULT,
                    outcome: 'bad_test',
                    bad_test: {
                        file: 'src/sum.test.ts',
                        name: 'sum > adds two numbers',
                        reason: '1 + 2 is 3, not 4.',
                    },
                },
            },
            // 4. A fresh test-writer replaces the bad test.
            {
                ...testWriter,
                act: async () => {
                    seen.freshWriter = launcher.openSessions()
                },
            },
            // 5. A fresh implementer leaves a console.log: lint fails.
            {
                ...implementer,
                files: {
                    'src/sum.ts': `${SUM}console.log('sum loaded')\n`,
                    'src/index.ts': "export { sum } from './sum'\n",
                },
                act: async () => {
                    seen.coder = launcher.openSessions()
                },
            },
            // 6. Its follow-up, in the same session, removes it.
            {
                ...implementer,
                files: { 'src/sum.ts': SUM },
                act: async () => {
                    seen.coderFix = launcher.openSessions()
                },
            },
            reviewer,
        ])

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const calls = callsOf(launcher, 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'follow_up test-writer',
            'launch implementer',
            'launch test-writer',
            'launch implementer',
            'follow_up implementer',
            'launch ticket-reviewer',
        ])
        const [writer1, writerFix, , writer2, coder2, coderFix] = calls
        expect(writerFix?.session_id).toBe(writer1?.session_id ?? '')
        expect(coderFix?.session_id).toBe(coder2?.session_id ?? '')
        // Each fix round found its session open, and only its own.
        expect(seen.writerFix).toEqual([writer1?.session_id ?? ''])
        expect(seen.freshWriter).toEqual([writer2?.session_id ?? ''])
        expect(seen.coder).toEqual([coder2?.session_id ?? ''])
        expect(seen.coderFix).toEqual([coder2?.session_id ?? ''])
        expectEveryoneClosed({ launcher, records })
    }, 90_000)

    test('a review fix round goes to a fresh implementer, and each reviewer’s session closes once its round is ruled on', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer } = happyTurns()
        const seen: Record<string, string[]> = {}
        const launcher: ScriptedLauncher = scriptedWith([
            testWriter,
            implementer,
            {
                role: 'ticket-reviewer',
                ticket: 11,
                result: {
                    verdict: 'changes_requested',
                    findings: [
                        {
                            id: 'R1-1',
                            severity: 'should_fix',
                            kind: 'code',
                            file: 'src/sum.ts',
                            title: 'Name the accumulator for what it holds',
                            detail: 'total reads like the result.',
                        },
                    ],
                    rulings: [],
                    summary: 'One fix.',
                    assumptions: [],
                },
            },
            {
                role: 'implementer',
                ticket: 11,
                files: { 'src/sum.ts': RENAMED_SUM },
                act: async () => {
                    seen.fixer = launcher.openSessions()
                },
                result: {
                    ...IMPLEMENTER_RESULT,
                    finding_responses: [
                        { finding_id: 'R1-1', response: 'fixed', reason: '' },
                    ],
                },
            },
            {
                role: 'ticket-reviewer',
                ticket: 11,
                act: async () => {
                    seen.reReview = launcher.openSessions()
                },
                result: {
                    verdict: 'approve',
                    findings: [],
                    rulings: [],
                    summary: 'Fixed.',
                    assumptions: [],
                },
            },
        ])

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const calls = callsOf(launcher, 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'launch implementer',
            'launch ticket-reviewer',
            'launch implementer',
            'launch ticket-reviewer',
        ])
        const [, , , fixer, reReview] = calls
        expect(seen.fixer).toEqual([fixer?.session_id ?? ''])
        expect(seen.reReview).toEqual([reReview?.session_id ?? ''])
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test('the final review closes each lens once it is ruled on, and its fixer after the fix commit; the fixer’s gate round reuses its session', async () => {
        const practice = await createPracticeRepo({ root })
        const seen: Record<string, string[]> = {}
        const fixerResult = {
            ...IMPLEMENTER_RESULT,
            finding_responses: [
                { finding_id: 'security-S1', response: 'fixed', reason: '' },
            ],
        }
        const launcher: ScriptedLauncher = scriptedWith([
            ...Object.values(happyTurns()),
            lensTurn({
                lens: 'security',
                findings: [
                    {
                        id: 'S1',
                        severity: 'should_fix',
                        kind: 'code',
                        file: 'src/sum.ts',
                        title: 'Name the accumulator for what it holds',
                        detail: 'total reads like the result.',
                    },
                ],
            }),
            // The code fixer leaves a console.log: lint fails.
            {
                role: 'implementer',
                ticket: 10,
                files: {
                    'src/sum.ts': `${RENAMED_SUM}console.log('sum loaded')\n`,
                },
                act: async () => {
                    seen.fixer = launcher.openSessions()
                },
                result: fixerResult,
            },
            // Its follow-up, in the same session, removes it.
            {
                role: 'implementer',
                ticket: 10,
                files: { 'src/sum.ts': RENAMED_SUM },
                act: async () => {
                    seen.fixerFix = launcher.openSessions()
                },
                result: fixerResult,
            },
            {
                ...lensTurn({ lens: 'security' }),
                act: async () => {
                    seen.reReview = launcher.openSessions()
                },
            },
        ])

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const fixerCalls = launcher
            .launches()
            .filter(
                ({ ticket, role }) => ticket === 10 && role === 'implementer'
            )
        expect(fixerCalls.map(({ kind }) => kind)).toEqual([
            'launch',
            'follow_up',
        ])
        const [fixer, fixerFix] = fixerCalls
        expect(fixerFix?.session_id).toBe(fixer?.session_id ?? '')
        // Every lens of the first round was ruled on before the fixer ran.
        expect(seen.fixer).toEqual([fixer?.session_id ?? ''])
        expect(seen.fixerFix).toEqual([fixer?.session_id ?? ''])
        expect(seen.reReview ?? []).not.toContain(fixer?.session_id ?? '')
        expect(seen.reReview?.length ?? 0).toBeGreaterThan(0)
        expectEveryoneClosed({ launcher, records })
    }, 90_000)

    test("the learner's session closes too, in a run with memory on", async () => {
        const practice = await createPracticeRepo({ root })
        const launcher = scriptedWith(Object.values(happyTurns()))

        const { action, records } = await practice.run({
            launcher,
            memory: { client: createFakeMuninn(), project_vault: 'practice' },
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(
            launchedBy(launcher).some(({ role }) => role === 'learner')
        ).toBe(true)
        expectEveryoneClosed({ launcher, records })
    }, 60_000)
})

describe('sessions close on every other way a step ends, end to end', () => {
    test('a stuck ticket leaves none of its sessions open while it waits for a reply', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter } = happyTurns()
        const launcher = scriptedWith([
            testWriter,
            {
                role: 'implementer',
                ticket: 11,
                result: {
                    outcome: 'needs_setup_change',
                    setup_change: {
                        file: 'test/setup.ts',
                        reason: 'The tests need a fake clock installed first.',
                    },
                },
            },
        ])

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(
            records.some(
                (record) =>
                    record.kind === 'ticket_stuck' &&
                    record.content.reason === 'setup_change_needed'
            )
        ).toBe(true)
        expect(launchedBy(launcher).map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
        ])
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test("a ticket stuck in its red-check fix loop closes its test-writer's session", async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter } = happyTurns()
        const passingAlready: ScriptedTurn = {
            ...testWriter,
            files: { 'src/sum.test.ts': PASSING_SUM_TEST },
        }
        const launcher = scriptedWith(
            Array.from({ length: MAX_FIX_ROUNDS + 1 }, () => passingAlready)
        )

        const { action, records } = await practice.run({ launcher })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(
            records.some(
                (record) =>
                    record.kind === 'ticket_stuck' &&
                    record.content.reason === 'red_check_failed'
            )
        ).toBe(true)
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test('a skipped ticket and its dependents leave no session open, and the rest ships', async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = trackerWith([
            ticketIssue({
                number: 11,
                title: 'Add sum',
                criteria: SUM_CRITERIA,
            }),
            ticketIssue({
                number: 12,
                title: 'Add product',
                criteria: ['product multiplies'],
            }),
            ticketIssue({
                number: 13,
                title: 'Add average',
                criteria: ['average of the numbers'],
                blocked_by: [12],
            }),
        ])
        const launcher = scriptedWith([
            ...Object.values(happyTurns()),
            {
                role: 'test-writer',
                ticket: 12,
                result: {
                    outcome: 'nothing_new_to_test',
                    summary: 'Nothing to test.',
                },
            },
        ])
        const clock = ownerClock({
            journal: practice.journal,
            when: (state) =>
                (state.tickets[12]?.stuck_report ?? null) !== null &&
                (state.tickets[11]?.pushed ?? null) !== null,
            act: () => {
                tracker.addComment({
                    number: 10,
                    author: SPEC_OWNER,
                    body: 'skip #12',
                })
            },
        })

        const { action, records } = await practice.run({
            launcher,
            tracker,
            clock,
            stop_before: [],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(replayRun({ records }).tickets[12]?.skipped).toEqual({
            because: null,
        })
        expectEveryoneClosed({ launcher, records })
    }, 60_000)

    test("the owner's stop closes the sessions of a ticket still in its fix loop", async () => {
        const practice = await createPracticeRepo({ root })
        const tracker = trackerWith([
            ticketIssue({
                number: 11,
                title: 'Add sum',
                criteria: SUM_CRITERIA,
            }),
            ticketIssue({
                number: 12,
                title: 'Add sum again',
                criteria: SUM_CRITERIA,
            }),
        ])
        const { testWriter } = happyTurns()
        const launcher = scriptedWith([
            {
                role: 'test-writer',
                ticket: 11,
                result: { outcome: 'nothing_new_to_test' },
            },
            { ...testWriter, ticket: 12 },
            // #12's gates keep failing, so its implementer stays in its loop.
            ...Array.from({ length: MAX_FIX_ROUNDS + 1 }, () =>
                wrongImplementer(12)
            ),
        ])
        const clock = ownerClock({
            journal: practice.journal,
            when: (state) =>
                (state.tickets[11]?.stuck_report ?? null) !== null &&
                (state.tickets[12]?.implementer ?? null) !== null,
            act: () => {
                tracker.addComment({
                    number: 10,
                    author: SPEC_OWNER,
                    body: 'stop',
                })
            },
        })

        const { action, records } = await practice.run({
            launcher,
            tracker,
            clock,
            stop_before: [],
        })

        expect(action).toEqual({ type: 'done', outcome: 'stopped_by_user' })
        expect(
            launchedBy(launcher).some(
                ({ role, session_id }) =>
                    role === 'implementer' && session_id.includes('-12-')
            )
        ).toBe(true)
        expectEveryoneClosed({ launcher, records })
    }, 90_000)

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

        await expect(
            practice.run({ launcher: crashingOnFollowUp(crashed) })
        ).rejects.toThrow('The engine crashed.')
        const cutOffCoder = crashed
            .launches()
            .find(({ role }) => role === 'implementer')
        if (cutOffCoder === undefined) throw new Error('no implementer')

        const resumed = scriptedWith([implementer, reviewer])
        const { action } = await practice.run({
            resume: true,
            launcher: resumed,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const records = practice.journal.read()
        expect(closeOf(records, cutOffCoder.session_id)).toMatchObject({
            ticket: 11,
            role: 'implementer',
        })
        expect(resumed.openSessions()).toEqual([])
        expect(closedIn(records)).toEqual(
            [...launchedBy(crashed), ...launchedBy(resumed)].toSorted(byId)
        )
    }, 90_000)
})
