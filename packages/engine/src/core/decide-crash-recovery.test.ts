import { describe, expect, test } from 'bun:test'

import { decideSteps, type EngineAction } from './decide'
import { CRASH_SECTION } from './fix-loop-text'
import { MAX_CRASHES, MAX_FIX_ROUNDS } from './loop-caps'

import type { AgentRole } from '../agents/role-results'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import { replayRun, type RunState } from '../journal/replay'
import { resumeEntry, stepFirstSeq } from '../journal/step-records'
import {
    agentFailed,
    agentSession,
    agentStarted,
    commentRead,
    commitMade,
    finding,
    gatesRun,
    implemented,
    intakePassed,
    leftoverScan,
    limitWaitEnded,
    limitWaitStarted,
    practiceTicket,
    rateLimitReading,
    redCheck,
    replyReceived,
    reviewed,
    runBranchCreated,
    SESSIONS,
    stepEnded,
    stepStarted,
    stuckReported,
    testsWritten,
    ticketBuilt,
    ticketRetried,
    ticketStuck,
    withInstalls,
} from '../testing/build-fixtures'
import {
    finalReviewFixing,
    finalReviewRetried,
    finalReviewStarted,
    finalReviewStuck,
    lensFinding,
    lensReviewed,
    lensRound,
} from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1 for crash recovery (#369): the decision step handed a journal cut
 * off anywhere by a crash, with the `run_resumed` a restarted engine
 * appends. Every cut-off step is taken again; an agent's turn in a fresh
 * session. The same step cut off `MAX_CRASHES` times in a row is stuck.
 */

const SUM = practiceTicket({ number: 11 })

/** The whole journal: intake passed with these tickets, then the entries. */
const journal = (
    entries: JournalEntry[],
    tickets: TicketSnapshot[] = [SUM]
): JournalEntry[] => [
    ...intakePassed({ tickets }),
    ...withInstalls({ entries }),
]

const stateOf = (full: JournalEntry[]): RunState =>
    replayRun({ records: recordsFrom({ entries: full }) })

const stepsOf = (full: JournalEntry[]): EngineAction[] =>
    decideSteps({ records: recordsFrom({ entries: full }) })

/** The one step the decision step takes on this journal. */
const stepOf = (full: JournalEntry[]): EngineAction => {
    const steps = stepsOf(full)
    if (steps.length !== 1) {
        throw new Error(steps.map(({ type }) => type).join(', '))
    }
    return steps[0] as EngineAction
}

/** The engine starts again on the journal, as `runEngine` does. */
const restart = (full: JournalEntry[]): JournalEntry[] => {
    const resumed = resumeEntry({ records: recordsFrom({ entries: full }) })
    return resumed === null ? full : [...full, resumed]
}

type StepName = {
    ticket: number | null
    step: string
    key?: string
    role?: AgentRole
}

const keyFor = ({ ticket, key }: StepName): string =>
    key ?? (ticket === null ? 'run' : String(ticket))

/** The scheduler starts a step: with its first try's seq on a redo. */
const startStep = (full: JournalEntry[], name: StepName): JournalEntry[] => [
    ...full,
    stepStarted({
        ...name,
        first_seq:
            stepFirstSeq({
                crashes: stateOf(full).crashes,
                key: keyFor(name),
                step: name.step,
            }) ?? undefined,
    }),
]

/** The seq the next record appended to this journal gets. */
const nextSeq = (full: JournalEntry[]): number => full.length + 1

const promptOf = (step: EngineAction): string => {
    if (
        step.type === 'launch_agent' ||
        step.type === 'launch_final_fixer' ||
        step.type === 'launch_lens'
    ) {
        return step.prompt
    }
    throw new Error(`${step.type} has no prompt`)
}

const LAUNCH_TW: StepName = {
    ticket: 11,
    step: 'launch_agent:test-writer',
    role: 'test-writer',
}

/** #11 has its worktree and baseline: the test-writer is next. */
const started = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, 2),
]

/** #11's test-writer launch, cut off by a crash mid-turn. */
const launchCut = (full: JournalEntry[]): JournalEntry[] =>
    restart([
        ...startStep(full, LAUNCH_TW),
        agentStarted({ ticket: 11, role: 'test-writer' }),
    ])

/** #11's tests are committed, its code written, and its gates failed. */
const gatesFailed = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }).slice(0, 6),
    implemented({ ticket: 11 }),
    gatesRun({ ticket: 11, target: 'ticket', ok: false }),
]

const FOLLOW_UP_IMPL: StepName = {
    ticket: 11,
    step: 'follow_up_agent:implementer',
    role: 'implementer',
}

/** A follow-up to the implementer's session, cut off by a crash. */
const followUpCut = (full: JournalEntry[]): JournalEntry[] =>
    restart([
        ...startStep(full, FOLLOW_UP_IMPL),
        agentStarted({
            ticket: 11,
            role: 'implementer',
            follow_up_of: SESSIONS.implementer,
        }),
    ])

describe('a crash mid agent turn', () => {
    test('a cut-off launch starts again, fresh, and the agent hears of the crash', () => {
        const step = stepOf(launchCut(journal(started())))

        expect(step).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
        })
        expect(promptOf(step)).toContain(CRASH_SECTION)
    })

    test('without a crash, a launch has no crash section', () => {
        expect(promptOf(stepOf(journal(started())))).not.toContain(
            CRASH_SECTION
        )
    })

    test('a cut-off gate fix follow-up becomes a fresh launch carrying the same message', () => {
        const full = journal(gatesFailed())
        const before = stepOf(full)
        if (before.type !== 'follow_up_agent') throw new Error(before.type)

        const step = stepOf(followUpCut(full))

        expect(step).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'implementer',
            may_edit_tests: false,
        })
        expect(promptOf(step)).toContain(before.message)
        expect(promptOf(step)).toContain(CRASH_SECTION)
        expect(stateOf(followUpCut(full)).tickets[11]?.sessions).toEqual({
            'test-writer': SESSIONS['test-writer'],
        })
    })

    test('a cut-off red check follow-up becomes a fresh test-writer with the red check message', () => {
        const full = journal([
            ...started(),
            testsWritten({ ticket: 11 }),
            redCheck({ ticket: 11, ok: false }),
        ])
        const before = stepOf(full)
        if (before.type !== 'follow_up_agent') throw new Error(before.type)

        const step = stepOf(
            restart([
                ...startStep(full, {
                    ticket: 11,
                    step: 'follow_up_agent:test-writer',
                    role: 'test-writer',
                }),
                agentStarted({
                    ticket: 11,
                    role: 'test-writer',
                    follow_up_of: SESSIONS['test-writer'],
                }),
            ])
        )

        expect(step).toMatchObject({
            type: 'launch_agent',
            role: 'test-writer',
            may_edit_tests: true,
        })
        expect(promptOf(step)).toContain(before.message)
        expect(promptOf(step)).toContain(CRASH_SECTION)
    })

    test('a cut-off failed-try follow-up becomes a fresh launch with the same message', () => {
        const full = journal([
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }).slice(0, 6),
            agentFailed({ ticket: 11, role: 'implementer', failure: 'agent' }),
        ])
        const before = stepOf(full)
        if (before.type !== 'follow_up_agent') throw new Error(before.type)

        const step = stepOf(followUpCut(full))

        expect(step).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
        })
        expect(promptOf(step)).toContain(before.message)
    })

    test('a cut-off review fix follow-up becomes a fresh implementer with the findings', () => {
        const full = journal([
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }).slice(0, 10),
            reviewed({
                ticket: 11,
                findings: [finding({ id: 'F1', title: 'Sum drops floats' })],
            }),
        ])
        expect(stepOf(full).type).toBe('follow_up_agent')

        const step = stepOf(followUpCut(full))

        expect(step).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
        })
        expect(promptOf(step)).toContain('Sum drops floats')
        expect(promptOf(step)).toContain(CRASH_SECTION)
    })

    test('fix round counts survive a restart: the cap still holds', () => {
        const round = (): JournalEntry[] => [
            agentStarted({
                ticket: 11,
                role: 'implementer',
                follow_up_of: SESSIONS.implementer,
            }),
            implemented({ ticket: 11 }),
            gatesRun({ ticket: 11, target: 'ticket', ok: false }),
        ]
        const twoRounds = journal([...gatesFailed(), ...round(), ...round()])
        const cut = followUpCut(twoRounds)
        expect(stateOf(cut).tickets[11]?.gate_fix_rounds).toBe(2)
        expect(stepOf(cut).type).toBe('launch_agent')

        const redone = [
            ...startStep(cut, {
                ticket: 11,
                step: 'launch_agent:implementer',
                role: 'implementer',
            }),
            agentStarted({ ticket: 11, role: 'implementer' }),
            implemented({ ticket: 11, session_id: 'impl-2' }),
            gatesRun({ ticket: 11, target: 'ticket', ok: false }),
        ]

        expect(stateOf(redone).tickets[11]?.gate_fix_rounds).toBe(
            MAX_FIX_ROUNDS
        )
        expect(stepOf(redone)).toMatchObject({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'gates_failed',
        })
    })
})

describe('a crash between steps', () => {
    test('right after a commit, the next step runs and nothing is redone', () => {
        const full = journal([
            ...started(),
            testsWritten({ ticket: 11 }),
            redCheck({ ticket: 11, ok: true }),
        ])
        const cut = restart([
            ...startStep(full, { ticket: 11, step: 'commit_ticket' }),
            leftoverScan({ ticket: 11, stage: 'red' }),
            commitMade({ ticket: 11, stage: 'red' }),
        ])

        const step = stepOf(cut)
        expect(step).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
        })
        expect(promptOf(step)).not.toContain(CRASH_SECTION)
    })

    test('a commit cut off before it is journaled is taken again, knowing its first try', () => {
        const full = journal([
            ...started(),
            testsWritten({ ticket: 11 }),
            redCheck({ ticket: 11, ok: true }),
        ])
        const first = nextSeq(full)
        const cut = restart([
            ...startStep(full, { ticket: 11, step: 'commit_ticket' }),
            leftoverScan({ ticket: 11, stage: 'red' }),
        ])

        expect(stepOf(cut)).toMatchObject({
            type: 'commit_ticket',
            ticket: 11,
            stage: 'red',
        })
        expect(stateOf(cut).crashes['11']).toEqual({
            step: 'commit_ticket',
            count: 1,
            first_seq: first,
        })
        expect(
            stepFirstSeq({
                crashes: stateOf(cut).crashes,
                key: '11',
                step: 'commit_ticket',
            })
        ).toBe(first)
    })

    test('a restart with nothing cut off appends no run_resumed', () => {
        const full = journal([
            ...started(),
            ...startStep([], LAUNCH_TW),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            testsWritten({ ticket: 11 }),
            stepEnded(LAUNCH_TW),
        ])
        expect(resumeEntry({ records: recordsFrom({ entries: full }) })).toBe(
            null
        )
    })

    test('a step the launcher stopped is no crash: it is picked up again as it was', () => {
        const full = journal([
            ...gatesFailed(),
            ...startStep([], FOLLOW_UP_IMPL),
            agentStarted({
                ticket: 11,
                role: 'implementer',
                follow_up_of: SESSIONS.implementer,
            }),
            {
                kind: 'run_stopped',
                ticket: 11,
                role: 'implementer',
                content: { reason: 'the wrong model', role: 'implementer' },
            },
        ])

        expect(restart(full)).toEqual(full)
        expect(stateOf(full).crashes).toEqual({})
        expect(stepOf(full).type).toBe('follow_up_agent')
    })

    test('a restart that crashes again before the redo starts counts the crash once', () => {
        const once = launchCut(journal(started()))
        const twice = restart(once)

        expect(twice).toEqual(once)
        expect(stateOf(twice).crashes['11']?.count).toBe(1)
    })
})

describe('a crash during a limit wait', () => {
    const UNTIL = '2026-01-01T05:01:00.000Z'
    const RESET = '2026-01-01T05:00:00.000Z'

    /** #11's test-writer hit the limit, and the limit wait started. */
    const waiting = (): JournalEntry[] =>
        journal([
            ...started(),
            ...startStep([], LAUNCH_TW),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            agentSession({
                ticket: 11,
                role: 'test-writer',
                rate_limit_events: [
                    rateLimitReading({ status: 'rejected', resets_at: RESET }),
                ],
            }),
            stepEnded(LAUNCH_TW),
            stepStarted({ ticket: null, step: 'start_limit_wait' }),
            limitWaitStarted({ until: UNTIL, resets_at: RESET }),
        ])

    test('it still waits until the same time, and the spec issue hears nothing new', () => {
        const cut = restart(waiting())

        expect(stepsOf(cut)).toEqual([{ type: 'wait_for_limit', until: UNTIL }])
    })

    test('a crash in the wait itself leaves no step to redo; the wait goes on', () => {
        const full = [
            ...waiting(),
            stepEnded({ ticket: null, step: 'start_limit_wait' }),
        ]
        expect(restart(full)).toEqual(full)
        expect(stepsOf(full)).toEqual([
            { type: 'wait_for_limit', until: UNTIL },
        ])
    })

    test('after the wait, the cut-off test-writer launches again', () => {
        const full = [...restart(waiting()), limitWaitEnded({ until: UNTIL })]
        expect(stepOf(full)).toMatchObject({
            type: 'launch_agent',
            role: 'test-writer',
        })
    })
})

describe('a crash while stuck', () => {
    const stuck = (): JournalEntry[] =>
        journal([
            ...gatesFailed(),
            ticketStuck({ ticket: 11, reason: 'gates_failed' }),
        ])

    test('a cut-off report is posted again, knowing its first try', () => {
        const full = stuck()
        const first = nextSeq(full)
        const cut = restart(
            startStep(full, { ticket: 11, step: 'report_stuck' })
        )

        expect(stepOf(cut)).toMatchObject({ type: 'report_stuck', ticket: 11 })
        expect(
            stepFirstSeq({
                crashes: stateOf(cut).crashes,
                key: '11',
                step: 'report_stuck',
            })
        ).toBe(first)
    })

    test('after the report, the restarted engine waits for a reply again', () => {
        const full = restart([
            ...stuck(),
            stepStarted({ ticket: 11, step: 'report_stuck' }),
            stuckReported({ ticket: 11 }),
            stepEnded({ ticket: 11, step: 'report_stuck' }),
        ])

        expect(stepsOf(full)).toEqual([
            { type: 'wait_for_reply', spec_number: 10, since_id: 111 },
        ])
    })

    test('a reply posted while the engine was down is read and taken', () => {
        const full = restart([
            ...stuck(),
            stuckReported({ ticket: 11 }),
            commentRead({ comment_id: 120, body: 'retry' }),
        ])

        expect(stepsOf(full)).toEqual([
            { type: 'take_reply', comment_id: 120, word: 'retry', ticket: 11 },
        ])
    })
})

describe('a crash during the final review', () => {
    const SECURITY = lensFinding({ id: 'S1', title: 'Sum trusts its input' })

    /** Every ticket pushed. */
    const built = (): JournalEntry[] => [
        runBranchCreated(),
        ...ticketBuilt({ ticket: 11 }),
    ]

    const LENS_STEP: StepName = {
        ticket: null,
        key: 'lens:security',
        step: 'launch_lens:security-lens',
        role: 'security-lens',
    }

    /** Round 1 with every lens but security finished. */
    const lensesRunning = (): JournalEntry[] =>
        journal([
            ...built(),
            finalReviewStarted({ round: 1 }),
            ...(
                [
                    'architecture',
                    'simplification',
                    'integration',
                    'rules',
                ] as const
            ).flatMap((lens) => lensReviewed({ lens, round: 1 })),
        ])

    const lensCut = (full: JournalEntry[]): JournalEntry[] =>
        restart([
            ...startStep(full, LENS_STEP),
            {
                kind: 'lens_started',
                ticket: null,
                role: null,
                content: { lens: 'security', round: 1 },
            },
            agentStarted({ ticket: null, role: 'security-lens' }),
        ])

    test('a cut-off lens starts again', () => {
        expect(stepsOf(lensCut(lensesRunning()))).toEqual([
            expect.objectContaining({
                type: 'launch_lens',
                lens: 'security',
            }),
        ])
    })

    /** Fix round 1 on a security finding, its implementer done, gates failed. */
    const fixerGatesFailed = (): JournalEntry[] =>
        journal([
            ...built(),
            ...lensRound({ round: 1, findings: { security: [SECURITY] } }),
            finalReviewFixing({ round: 1 }),
            agentStarted({ ticket: null, role: 'implementer' }),
            implemented({
                ticket: null,
                finding_responses: [
                    {
                        finding_id: 'security-S1',
                        response: 'fixed',
                        reason: '',
                    },
                ],
            }),
            gatesRun({ ticket: null, target: 'run_branch', ok: false }),
        ])

    test('a cut-off fixer follow-up becomes a fresh fixer with the failed gates', () => {
        const full = fixerGatesFailed()
        expect(stepOf(full).type).toBe('follow_up_final_fixer')

        const cut = restart([
            ...startStep(full, {
                ticket: null,
                key: 'final',
                step: 'follow_up_final_fixer:implementer',
                role: 'implementer',
            }),
            agentStarted({
                ticket: null,
                role: 'implementer',
                follow_up_of: SESSIONS.implementer,
            }),
        ])

        const step = stepOf(cut)
        expect(step).toMatchObject({
            type: 'launch_final_fixer',
            role: 'implementer',
        })
        expect(promptOf(step)).toContain('The gates failed')
        expect(promptOf(step)).toContain(CRASH_SECTION)
    })

    test('a cut-off fixer failed-try follow-up becomes a fresh fixer with the message', () => {
        const full = journal([
            ...built(),
            ...lensRound({ round: 1, findings: { security: [SECURITY] } }),
            finalReviewFixing({ round: 1 }),
            agentStarted({ ticket: null, role: 'implementer' }),
            agentFailed({
                ticket: null,
                role: 'implementer',
                failure: 'result',
            }),
        ])
        const before = stepOf(full)
        if (before.type !== 'follow_up_final_fixer') {
            throw new Error(before.type)
        }

        const step = stepOf(
            restart([
                ...startStep(full, {
                    ticket: null,
                    key: 'final',
                    step: 'follow_up_final_fixer:implementer',
                    role: 'implementer',
                }),
                agentStarted({
                    ticket: null,
                    role: 'implementer',
                    follow_up_of: SESSIONS.implementer,
                }),
            ])
        )

        expect(step).toMatchObject({
            type: 'launch_final_fixer',
            role: 'implementer',
        })
        expect(promptOf(step)).toContain(before.message)
    })

    test(`${MAX_CRASHES} crashes on the same lens make the final review stuck`, () => {
        let full = lensesRunning()
        for (let crash = 1; crash < MAX_CRASHES; crash += 1) {
            full = lensCut(full)
            expect(stepOf(full).type).toBe('launch_lens')
        }
        full = lensCut(full)

        expect(stepOf(full)).toEqual({
            type: 'mark_final_review_stuck',
            reason: 'crashed',
            detail: expect.stringContaining('launch_lens:security-lens'),
        })
    })

    test("the final review's retry gives fresh crash counts", () => {
        let full = lensesRunning()
        for (let crash = 0; crash < MAX_CRASHES; crash += 1)
            full = lensCut(full)
        full = [
            ...full,
            finalReviewStuck({ reason: 'crashed' }),
            finalReviewRetried(),
        ]

        expect(stateOf(full).crashes).toEqual({})
        expect(stepOf(full)).toMatchObject({
            type: 'launch_lens',
            lens: 'security',
        })
    })
})

describe(`${MAX_CRASHES} crashes on the same step`, () => {
    const cutThrice = (): JournalEntry[] => {
        let full = journal(started())
        for (let crash = 0; crash < MAX_CRASHES; crash += 1) {
            full = launchCut(full)
        }
        return full
    }

    test('fewer crashes take the step again', () => {
        let full = journal(started())
        for (let crash = 1; crash < MAX_CRASHES; crash += 1) {
            full = launchCut(full)
            expect(stepOf(full).type).toBe('launch_agent')
        }
        expect(stateOf(full).crashes['11']).toEqual({
            step: 'launch_agent:test-writer',
            count: MAX_CRASHES - 1,
            first_seq: nextSeq(journal(started())),
        })
    })

    test('make the ticket stuck, naming the step and the count', () => {
        const step = stepOf(cutThrice())

        expect(step).toEqual({
            type: 'mark_stuck',
            ticket: 11,
            reason: 'crashed',
            detail: expect.stringContaining('launch_agent:test-writer'),
        })
        if (step.type !== 'mark_stuck') throw new Error(step.type)
        expect(step.detail).toContain(`${MAX_CRASHES} times`)
    })

    test('the other tickets keep building', () => {
        let full = journal(
            [...started(), ...ticketBuilt({ ticket: 12 }).slice(0, 2)],
            [SUM, practiceTicket({ number: 12, title: 'Add product' })]
        )
        for (let crash = 0; crash < MAX_CRASHES; crash += 1) {
            full = launchCut(full)
        }

        expect(stepsOf(full)).toEqual([
            expect.objectContaining({ type: 'mark_stuck', ticket: 11 }),
            expect.objectContaining({ type: 'launch_agent', ticket: 12 }),
        ])
    })

    test('the stuck report and reply flow follows, and a retry gives fresh counts', () => {
        const stuckFull = [
            ...cutThrice(),
            stepStarted({ ticket: 11, step: 'mark_stuck' }),
            ticketStuck({ ticket: 11, reason: 'crashed' }),
            stepEnded({ ticket: 11, step: 'mark_stuck' }),
        ]
        expect(stepOf(stuckFull)).toMatchObject({
            type: 'report_stuck',
            ticket: 11,
        })

        const retried = [
            ...stuckFull,
            stuckReported({ ticket: 11 }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
        ]

        expect(stateOf(retried).crashes).toEqual({})
        expect(stepOf(retried)).toMatchObject({
            type: 'launch_agent',
            role: 'test-writer',
        })
    })

    test('crash counts reset once the step ends', () => {
        let full = journal(started())
        for (let crash = 1; crash < MAX_CRASHES; crash += 1) {
            full = launchCut(full)
        }
        full = [
            ...startStep(full, LAUNCH_TW),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            testsWritten({ ticket: 11 }),
            stepEnded(LAUNCH_TW),
        ]
        expect(stateOf(full).crashes).toEqual({})

        const cut = restart(
            startStep(full, { ticket: 11, step: 'run_red_check' })
        )
        expect(stateOf(cut).crashes['11']?.count).toBe(1)
        expect(stepOf(cut).type).toBe('run_red_check')
    })

    test('a step that crashes once in a while never adds up', () => {
        let full = journal(started())
        full = launchCut(full)
        full = [
            ...startStep(full, LAUNCH_TW),
            agentStarted({ ticket: 11, role: 'test-writer' }),
            testsWritten({ ticket: 11 }),
            stepEnded(LAUNCH_TW),
        ]
        full = restart(startStep(full, { ticket: 11, step: 'run_red_check' }))
        full = restart(startStep(full, { ticket: 11, step: 'run_red_check' }))

        expect(stateOf(full).crashes['11']).toMatchObject({
            step: 'run_red_check',
            count: 2,
        })
        expect(stepOf(full).type).toBe('run_red_check')
    })
})

describe(`${MAX_CRASHES} crashes on a run-level step`, () => {
    const CREATE: StepName = { ticket: null, step: 'create_run_branch' }

    const cutRun = (times: number): JournalEntry[] => {
        let full = journal([])
        for (let crash = 0; crash < times; crash += 1) {
            full = restart(startStep(full, CREATE))
        }
        return full
    }

    test('fewer crashes take it again', () => {
        expect(stepOf(cutRun(MAX_CRASHES - 1))).toMatchObject({
            type: 'create_run_branch',
        })
    })

    test('stop the run for good', () => {
        expect(stepOf(cutRun(MAX_CRASHES))).toEqual({
            type: 'stop_for_crashes',
            reason: expect.stringContaining('create_run_branch'),
        })
    })

    test('once journaled, the stop sticks', () => {
        const full = [
            ...cutRun(MAX_CRASHES),
            stepStarted({ ticket: null, step: 'stop_for_crashes' }),
            {
                kind: 'run_stopped',
                ticket: null,
                role: null,
                content: {
                    reason: 'it crashed',
                    role: null,
                    billing: false,
                    crashed: true,
                },
            } satisfies JournalEntry,
            stepEnded({ ticket: null, step: 'stop_for_crashes' }),
        ]

        expect(stepsOf(full)).toEqual([
            { type: 'done', outcome: 'crashed', reason: 'it crashed' },
        ])
        expect(stepsOf(restart([...full, runBranchCreated()]))).toEqual([
            { type: 'done', outcome: 'crashed', reason: 'it crashed' },
        ])
    })

    test('taking a reply that crashes every time stops the run too', () => {
        let full = journal([
            ...gatesFailed(),
            ticketStuck({ ticket: 11, reason: 'gates_failed' }),
            stuckReported({ ticket: 11 }),
            commentRead({ comment_id: 120, body: 'retry' }),
        ])
        const TAKE: StepName = {
            ticket: null,
            key: 'replies',
            step: 'take_reply',
        }
        for (let crash = 0; crash < MAX_CRASHES; crash += 1) {
            full = restart(startStep(full, TAKE))
        }

        expect(stepOf(full)).toMatchObject({ type: 'stop_for_crashes' })
    })
})
