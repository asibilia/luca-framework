import { afterEach, describe, expect, test } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentFailed,
    agentFinished,
    agentStarted,
    baselineTests,
    commitMade,
    dependenciesInstalled,
    engineFinalFixerTurn,
    engineFinalFixesLanded,
    engineFinalReviewStarted,
    engineLensTurn,
    finalReviewFixing,
    finalReviewPassed,
    finding,
    fixerFinished,
    gatesRun,
    intakeOfThree,
    joinClashed,
    leftoverScan,
    pullRequestOpened,
    redCheck,
    replyReceived,
    reviewFinished,
    runBranchPushed,
    sessionOf,
    ticketJoined,
    ticketRebased,
    ticketRetried,
    ticketStuck,
    ticketWorktreeCreated,
    unshownStuckRecord,
    wholeTicket,
    type Entry,
} from './testing/journal-fixtures'

import { RunRowSchema } from '../shared/board-rows'
import {
    BoardStateSchema,
    TicketStageSchema,
    type BoardState,
} from '../shared/board-state'

/**
 * The ticket's stage (#549): what the ticket is really doing, from the
 * journal records the board already reads. "reviewing" shows only while a
 * reviewer agent works; the red check and the gates are "testing"; any fix
 * round is "fixing"; joining the run branch and its gates there are
 * "joining".
 */

let harness: Harness
let sent = { run_id: '', token: '', next_seq: 1 }

afterEach(async () => {
    await harness.cleanup()
})

/** Starts a run and sends intake plus `entries` in one go. */
const runWith = async ({ entries }: { entries: Entry[] }) => {
    harness = await createHarness()
    const { run_id, token } = await harness.start()
    const reply = await harness.send({
        run_id,
        token,
        entries: [...intakeOfThree(), ...entries],
    })
    expect(reply.ok).toBe(true)
    sent = { run_id, token, next_seq: reply.next_seq }
}

/** Sends more records to the same run, after the ones already sent. */
const sendMore = async ({ entries }: { entries: Entry[] }) => {
    const reply = await harness.send({
        run_id: sent.run_id,
        token: sent.token,
        entries,
        first_seq: sent.next_seq,
    })
    expect(reply.ok).toBe(true)
    sent = { ...sent, next_seq: reply.next_seq }
}

/**
 * `step_started` as the engine journals it: `key` is the ticket's number,
 * or `run` for a step of no ticket; `step` is the action type, plus
 * `:<role>` for an agent's turn.
 */
const stepStarted = ({
    ticket,
    step,
    role = null,
}: {
    ticket: number | null
    step: string
    role?: string | null
}): Entry => ({
    kind: 'step_started',
    ticket,
    role,
    content: {
        key: ticket === null ? 'run' : String(ticket),
        step,
        first_seq: null,
    },
})

/** `step_ended` as the engine journals it once the step settles. */
const stepEnded = ({
    ticket,
    step,
    role = null,
}: {
    ticket: number | null
    step: string
    role?: string | null
}): Entry => ({
    kind: 'step_ended',
    ticket,
    role,
    content: { key: ticket === null ? 'run' : String(ticket), step },
})

/** A whole step: its start, the records it wrote, and its end. */
const wholeStep = ({
    ticket,
    step,
    role = null,
    entries,
}: {
    ticket: number | null
    step: string
    role?: string | null
    entries: Entry[]
}): Entry[] => [
    stepStarted({ ticket, step, role }),
    ...entries,
    stepEnded({ ticket, step, role }),
]

/** An agent's turn starting: its step, then its `agent_started`. */
const agentTurnStarts = ({
    ticket,
    role,
    follow_up = false,
}: {
    ticket: number
    role: string
    follow_up?: boolean
}): Entry[] => [
    stepStarted({
        ticket,
        step: `${follow_up ? 'follow_up_agent' : 'launch_agent'}:${role}`,
        role,
    }),
    agentStarted({
        ticket,
        role,
        follow_up_of: follow_up ? sessionOf({ ticket, role }) : null,
    }),
]

/** An agent's turn ending: its result, then its step's end. */
const agentTurnEnds = ({
    ticket,
    role,
    follow_up = false,
    finished,
}: {
    ticket: number
    role: string
    follow_up?: boolean
    finished?: Entry
}): Entry[] => [
    finished ?? agentFinished({ ticket, role }),
    stepEnded({
        ticket,
        step: `${follow_up ? 'follow_up_agent' : 'launch_agent'}:${role}`,
        role,
    }),
]

/** A commit of `stage`, with its leftover scan, as one step. */
const committed = ({
    ticket,
    stage,
}: {
    ticket: number
    stage: 'red' | 'green' | 'fix'
}): Entry[] =>
    wholeStep({
        ticket,
        step: 'commit_ticket',
        entries: [
            leftoverScan({ ticket, stage }),
            commitMade({ ticket, stage }),
        ],
    })

/** The checks running on the ticket's worktree (or the run branch). */
const gatesStart = ({ ticket }: { ticket: number }): Entry =>
    stepStarted({ ticket, step: 'run_gates' })

const gatesEnd = ({
    ticket,
    ok,
    target = 'ticket',
}: {
    ticket: number
    ok: boolean
    target?: 'ticket' | 'run_branch'
}): Entry[] => [
    gatesRun({ ticket, ok, target }),
    stepEnded({ ticket, step: 'run_gates' }),
]

const blockerOnly = [finding({ id: 'R1-1', severity: 'blocker' })]

/** One point in a ticket's life: the records up to it, and its stage then. */
type Checkpoint = { at: string; entries: Entry[]; stage: string }

/**
 * Sends each checkpoint's records in order and reads the ticket's stage
 * after each, as `<at>: <stage>` lines, so a wrong stage names its point.
 */
const stagesAlong = async ({
    ticket,
    checkpoints,
}: {
    ticket: number
    checkpoints: Checkpoint[]
}): Promise<string[]> => {
    const seen: string[] = []
    for (const { at, entries } of checkpoints) {
        await sendMore({ entries })
        seen.push(`${at}: ${(await harness.ticket({ number: ticket })).stage}`)
    }
    return seen
}

const expectedAlong = ({
    checkpoints,
}: {
    checkpoints: Checkpoint[]
}): string[] => checkpoints.map(({ at, stage }) => `${at}: ${stage}`)

const stageOf = async ({ ticket }: { ticket: number }) =>
    (await harness.ticket({ number: ticket })).stage

/** Ticket `ticket` from its worktree to its tests committed. */
const testsCommitted = ({ ticket }: { ticket: number }): Entry[] => [
    ticketWorktreeCreated({ ticket }),
    ...wholeStep({
        ticket,
        step: 'run_baseline_tests',
        entries: [baselineTests({ ticket, passed: 4 })],
    }),
    ...agentTurnStarts({ ticket, role: 'test-writer' }),
    ...agentTurnEnds({ ticket, role: 'test-writer' }),
    ...wholeStep({
        ticket,
        step: 'run_red_check',
        entries: [redCheck({ ticket, ok: true, failing: 2, passing: 4 })],
    }),
    ...committed({ ticket, stage: 'red' }),
]

/** Ticket `ticket` up to its first ticket review asking for changes. */
const reviewedOnce = ({ ticket }: { ticket: number }): Entry[] => [
    ...testsCommitted({ ticket }),
    ...agentTurnStarts({ ticket, role: 'implementer' }),
    ...agentTurnEnds({ ticket, role: 'implementer' }),
    gatesStart({ ticket }),
    ...gatesEnd({ ticket, ok: true }),
    ...committed({ ticket, stage: 'green' }),
    ...agentTurnStarts({ ticket, role: 'ticket-reviewer' }),
]

/** Ticket `ticket` approved by its ticket review, not yet joined. */
const approved = ({ ticket }: { ticket: number }): Entry[] => [
    ...reviewedOnce({ ticket }),
    ...agentTurnEnds({
        ticket,
        role: 'ticket-reviewer',
        finished: reviewFinished({ ticket }),
    }),
]

/** An approved ticket's join, its gates on the run branch, and the push. */
const joinedAndPushed = ({ ticket }: { ticket: number }): Entry[] => [
    ...wholeStep({
        ticket,
        step: 'join_run_branch',
        entries: [ticketJoined({ ticket })],
    }),
    gatesStart({ ticket }),
    ...gatesEnd({ ticket, ok: true, target: 'run_branch' }),
    ...wholeStep({
        ticket,
        step: 'push_run_branch',
        entries: [runBranchPushed({ ticket })],
    }),
]

/** The refactor ticket 11: no test-writer and no red check. */
const refactorDone = (): Entry[] => [
    ticketWorktreeCreated({ ticket: 11 }),
    ...agentTurnStarts({ ticket: 11, role: 'implementer' }),
    ...agentTurnEnds({ ticket: 11, role: 'implementer' }),
    gatesStart({ ticket: 11 }),
    ...gatesEnd({ ticket: 11, ok: true }),
    ...committed({ ticket: 11, stage: 'green' }),
    ...agentTurnStarts({ ticket: 11, role: 'ticket-reviewer' }),
    ...agentTurnEnds({
        ticket: 11,
        role: 'ticket-reviewer',
        finished: reviewFinished({ ticket: 11 }),
    }),
    ...joinedAndPushed({ ticket: 11 }),
]

const T = 13

describe('a ticket shows what it is really doing', () => {
    test('a normal ticket goes building, testing, reviewing, fixing, testing, reviewing, joining, done', async () => {
        await runWith({ entries: [] })
        const checkpoints: Checkpoint[] = [
            {
                at: 'worktree created',
                entries: [ticketWorktreeCreated({ ticket: T })],
                stage: 'building',
            },
            {
                at: 'install and baseline tests',
                entries: [
                    ...wholeStep({
                        ticket: T,
                        step: 'install_dependencies',
                        entries: [
                            dependenciesInstalled({ ticket: T, ok: true }),
                        ],
                    }),
                    ...wholeStep({
                        ticket: T,
                        step: 'run_baseline_tests',
                        entries: [baselineTests({ ticket: T, passed: 4 })],
                    }),
                ],
                stage: 'building',
            },
            {
                at: 'test-writer writes the tests',
                entries: agentTurnStarts({ ticket: T, role: 'test-writer' }),
                stage: 'building',
            },
            {
                at: 'red check runs',
                entries: [
                    ...agentTurnEnds({ ticket: T, role: 'test-writer' }),
                    stepStarted({ ticket: T, step: 'run_red_check' }),
                ],
                stage: 'testing',
            },
            {
                at: 'implementer codes',
                entries: [
                    redCheck({ ticket: T, ok: true, failing: 2, passing: 4 }),
                    stepEnded({ ticket: T, step: 'run_red_check' }),
                    ...committed({ ticket: T, stage: 'red' }),
                    ...agentTurnStarts({ ticket: T, role: 'implementer' }),
                ],
                stage: 'building',
            },
            {
                at: 'gates run',
                entries: [
                    ...agentTurnEnds({ ticket: T, role: 'implementer' }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'testing',
            },
            {
                at: 'reviewer reviews',
                entries: [
                    ...gatesEnd({ ticket: T, ok: true }),
                    ...committed({ ticket: T, stage: 'green' }),
                    ...agentTurnStarts({ ticket: T, role: 'ticket-reviewer' }),
                ],
                stage: 'reviewing',
            },
            {
                at: "implementer fixes the review's findings",
                entries: [
                    ...agentTurnEnds({
                        ticket: T,
                        role: 'ticket-reviewer',
                        finished: reviewFinished({
                            ticket: T,
                            findings: blockerOnly,
                        }),
                    }),
                    ...agentTurnStarts({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                ],
                stage: 'fixing',
            },
            {
                at: 'gates run on the fixes',
                entries: [
                    ...agentTurnEnds({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                        finished: fixerFinished({
                            ticket: T,
                            role: 'implementer',
                            responses: [
                                {
                                    finding_id: 'R1-1',
                                    response: 'fixed',
                                    reason: '',
                                },
                            ],
                        }),
                    }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'testing',
            },
            {
                at: 'reviewer reviews again',
                entries: [
                    ...gatesEnd({ ticket: T, ok: true }),
                    ...committed({ ticket: T, stage: 'fix' }),
                    ...agentTurnStarts({ ticket: T, role: 'ticket-reviewer' }),
                ],
                stage: 'reviewing',
            },
            {
                at: 'joining the run branch',
                entries: [
                    ...agentTurnEnds({
                        ticket: T,
                        role: 'ticket-reviewer',
                        finished: reviewFinished({ ticket: T }),
                    }),
                    stepStarted({ ticket: T, step: 'join_run_branch' }),
                ],
                stage: 'joining',
            },
            {
                at: 'joined, between steps',
                entries: [
                    ticketJoined({ ticket: T }),
                    stepEnded({ ticket: T, step: 'join_run_branch' }),
                ],
                stage: 'joining',
            },
            {
                at: 'gates run on the run branch',
                entries: [gatesStart({ ticket: T })],
                stage: 'joining',
            },
            {
                at: 'pushed',
                entries: [
                    ...gatesEnd({ ticket: T, ok: true, target: 'run_branch' }),
                    ...wholeStep({
                        ticket: T,
                        step: 'push_run_branch',
                        entries: [runBranchPushed({ ticket: T })],
                    }),
                ],
                stage: 'done',
            },
        ]

        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
    })

    test('failed gates send the ticket to fixing, and its next gates to testing', async () => {
        await runWith({
            entries: [
                ...testsCommitted({ ticket: T }),
                ...agentTurnStarts({ ticket: T, role: 'implementer' }),
                ...agentTurnEnds({ ticket: T, role: 'implementer' }),
                gatesStart({ ticket: T }),
                ...gatesEnd({ ticket: T, ok: false }),
            ],
        })
        const checkpoints: Checkpoint[] = [
            {
                at: 'implementer fixes the failed gates',
                entries: agentTurnStarts({
                    ticket: T,
                    role: 'implementer',
                    follow_up: true,
                }),
                stage: 'fixing',
            },
            {
                at: 'gates run again',
                entries: [
                    ...agentTurnEnds({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'testing',
            },
        ]

        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
        expect(await harness.ticket({ number: T })).toMatchObject({
            fix_round: 1,
            open_check: 'gates',
        })
    })

    test('a failed red check sends the test-writer to fixing', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: T }),
                ...agentTurnStarts({ ticket: T, role: 'test-writer' }),
                ...agentTurnEnds({ ticket: T, role: 'test-writer' }),
                ...wholeStep({
                    ticket: T,
                    step: 'run_red_check',
                    entries: [
                        redCheck({
                            ticket: T,
                            ok: false,
                            failing: 0,
                            passing: 4,
                        }),
                    ],
                }),
                ...agentTurnStarts({
                    ticket: T,
                    role: 'test-writer',
                    follow_up: true,
                }),
            ],
        })

        expect(await harness.ticket({ number: T })).toMatchObject({
            stage: 'fixing',
            open_check: 'red_check',
            fix_round: 1,
        })
    })

    test('a clash on joining is fixed on top of the run branch, then tested and reviewed again', async () => {
        await runWith({ entries: approved({ ticket: T }) })
        const checkpoints: Checkpoint[] = [
            {
                at: 'joining the run branch',
                entries: [stepStarted({ ticket: T, step: 'join_run_branch' })],
                stage: 'joining',
            },
            {
                at: 'sent back onto the run branch',
                entries: [
                    joinClashed({ ticket: T }),
                    stepEnded({ ticket: T, step: 'join_run_branch' }),
                    ...wholeStep({
                        ticket: T,
                        step: 'rebase_ticket',
                        entries: [
                            ticketRebased({
                                ticket: T,
                                cause: 'clash',
                                code: ['src/index.ts'],
                            }),
                        ],
                    }),
                ],
                stage: 'fixing',
            },
            {
                at: 'gates run on the rebased ticket',
                entries: [
                    ...agentTurnStarts({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                    ...agentTurnEnds({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'testing',
            },
            {
                at: 'a fresh reviewer reviews',
                entries: [
                    ...gatesEnd({ ticket: T, ok: true }),
                    ...agentTurnStarts({ ticket: T, role: 'ticket-reviewer' }),
                ],
                stage: 'reviewing',
            },
        ]

        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
    })

    test('gates failing after joining send the ticket from joining to fixing', async () => {
        await runWith({ entries: approved({ ticket: T }) })
        const checkpoints: Checkpoint[] = [
            {
                at: 'gates run on the run branch',
                entries: [
                    ...wholeStep({
                        ticket: T,
                        step: 'join_run_branch',
                        entries: [ticketJoined({ ticket: T })],
                    }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'joining',
            },
            {
                at: 'sent back after the failed gates',
                entries: [
                    ...gatesEnd({ ticket: T, ok: false, target: 'run_branch' }),
                    ...wholeStep({
                        ticket: T,
                        step: 'rebase_ticket',
                        entries: [
                            ticketRebased({ ticket: T, cause: 'join_gates' }),
                        ],
                    }),
                ],
                stage: 'fixing',
            },
        ]

        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
    })
})

describe('"reviewing" shows only while a reviewer agent works', () => {
    test('the stage leaves reviewing once the reviewer finishes', async () => {
        await runWith({ entries: reviewedOnce({ ticket: T }) })
        expect(await stageOf({ ticket: T })).toBe('reviewing')

        await sendMore({
            entries: [reviewFinished({ ticket: T, findings: blockerOnly })],
        })

        expect(await stageOf({ ticket: T })).not.toBe('reviewing')
    })

    test('a review fix round shows fixing for both fixers, not reviewing', async () => {
        await runWith({
            entries: [
                ...reviewedOnce({ ticket: T }),
                ...agentTurnEnds({
                    ticket: T,
                    role: 'ticket-reviewer',
                    finished: reviewFinished({
                        ticket: T,
                        findings: [
                            finding({ id: 'R1-1', severity: 'blocker' }),
                            finding({
                                id: 'R1-2',
                                severity: 'should_fix',
                                kind: 'test',
                            }),
                        ],
                    }),
                }),
                ...agentTurnStarts({ ticket: T, role: 'test-writer' }),
            ],
        })
        expect(await harness.ticket({ number: T })).toMatchObject({
            stage: 'fixing',
            role: 'test-writer',
            review_fix_round: 1,
        })

        await sendMore({
            entries: [
                ...agentTurnEnds({
                    ticket: T,
                    role: 'test-writer',
                    finished: fixerFinished({
                        ticket: T,
                        role: 'test-writer',
                        responses: [
                            {
                                finding_id: 'R1-2',
                                response: 'fixed',
                                reason: '',
                            },
                        ],
                    }),
                }),
                ...agentTurnStarts({
                    ticket: T,
                    role: 'implementer',
                    follow_up: true,
                }),
            ],
        })
        expect(await harness.ticket({ number: T })).toMatchObject({
            stage: 'fixing',
            role: 'implementer',
            review_fix_round: 1,
        })
    })

    test('failed gates inside a review fix round show testing, then fixing, never reviewing', async () => {
        await runWith({
            entries: [
                ...reviewedOnce({ ticket: T }),
                ...agentTurnEnds({
                    ticket: T,
                    role: 'ticket-reviewer',
                    finished: reviewFinished({
                        ticket: T,
                        findings: blockerOnly,
                    }),
                }),
                ...agentTurnStarts({
                    ticket: T,
                    role: 'implementer',
                    follow_up: true,
                }),
                ...agentTurnEnds({
                    ticket: T,
                    role: 'implementer',
                    follow_up: true,
                }),
            ],
        })
        const checkpoints: Checkpoint[] = [
            {
                at: 'gates run on the review fixes',
                entries: [gatesStart({ ticket: T })],
                stage: 'testing',
            },
            {
                at: 'implementer fixes the failed gates',
                entries: [
                    ...gatesEnd({ ticket: T, ok: false }),
                    ...agentTurnStarts({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                ],
                stage: 'fixing',
            },
        ]

        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
    })

    test('an approved ticket shows joining, not reviewing, while it joins', async () => {
        await runWith({ entries: approved({ ticket: T }) })
        expect(await stageOf({ ticket: T })).not.toBe('reviewing')

        await sendMore({
            entries: [stepStarted({ ticket: T, step: 'join_run_branch' })],
        })

        expect(await stageOf({ ticket: T })).toBe('joining')
    })

    test('without step records, a joined ticket shows joining until it is pushed', async () => {
        await runWith({
            entries: [
                ...wholeTicket({ ticket: T }).slice(0, 17),
                ticketJoined({ ticket: T }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('joining')

        await sendMore({
            entries: [
                gatesRun({ ticket: T, ok: true, target: 'run_branch' }),
                runBranchPushed({ ticket: T }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('done')
    })
})

describe('a stuck ticket', () => {
    test('shows stuck until a reply, then what it does next', async () => {
        await runWith({
            entries: [
                ...testsCommitted({ ticket: T }),
                ...agentTurnStarts({ ticket: T, role: 'implementer' }),
                ...agentTurnEnds({ ticket: T, role: 'implementer' }),
                gatesStart({ ticket: T }),
                ...gatesEnd({ ticket: T, ok: false }),
                stepStarted({ ticket: T, step: 'mark_stuck' }),
                ticketStuck({
                    ticket: T,
                    reason: 'gates_failed',
                    detail: 'bun test: 1 test fails',
                }),
                stepEnded({ ticket: T, step: 'mark_stuck' }),
            ],
        })
        const checkpoints: Checkpoint[] = [
            {
                at: 'the spec issue is told',
                entries: [
                    ...wholeStep({
                        ticket: T,
                        step: 'report_stuck',
                        entries: [
                            unshownStuckRecord({ kind: 'stuck_reported' }),
                        ],
                    }),
                ],
                stage: 'stuck',
            },
            {
                at: 'implementer fixes after the retry',
                entries: [
                    ...wholeStep({
                        ticket: null,
                        step: 'take_reply',
                        entries: [replyReceived({ word: 'retry', ticket: T })],
                    }),
                    ...wholeStep({
                        ticket: T,
                        step: 'retry_ticket',
                        entries: [ticketRetried({ ticket: T, mode: 'resume' })],
                    }),
                    ...agentTurnStarts({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                ],
                stage: 'fixing',
            },
            {
                at: 'gates run again',
                entries: [
                    ...agentTurnEnds({
                        ticket: T,
                        role: 'implementer',
                        follow_up: true,
                    }),
                    gatesStart({ ticket: T }),
                ],
                stage: 'testing',
            },
        ]

        expect(await stageOf({ ticket: T })).toBe('stuck')
        expect(await stagesAlong({ ticket: T, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
    })

    test('a ticket stuck in its review shows reviewing again once retried', async () => {
        await runWith({
            entries: [
                ...reviewedOnce({ ticket: T }),
                agentFailed({
                    ticket: T,
                    role: 'ticket-reviewer',
                    error: 'The turn ran out.',
                }),
                stepEnded({
                    ticket: T,
                    step: 'launch_agent:ticket-reviewer',
                    role: 'ticket-reviewer',
                }),
                ticketStuck({
                    ticket: T,
                    reason: 'agent_failed',
                    detail: 'The ticket-reviewer failed.',
                }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('stuck')

        await sendMore({
            entries: [
                replyReceived({ word: 'retry', ticket: T }),
                ticketRetried({ ticket: T, mode: 'resume' }),
                ...agentTurnStarts({ ticket: T, role: 'ticket-reviewer' }),
            ],
        })

        expect(await stageOf({ ticket: T })).toBe('reviewing')

        await sendMore({
            entries: [
                ...agentTurnEnds({
                    ticket: T,
                    role: 'ticket-reviewer',
                    finished: reviewFinished({ ticket: T }),
                }),
                stepStarted({ ticket: T, step: 'join_run_branch' }),
            ],
        })

        expect(await stageOf({ ticket: T })).toBe('joining')
    })

    test('a ticket stuck after joining stays stuck while its join is undone', async () => {
        await runWith({
            entries: [
                ...approved({ ticket: T }),
                ...wholeStep({
                    ticket: T,
                    step: 'join_run_branch',
                    entries: [ticketJoined({ ticket: T })],
                }),
                gatesStart({ ticket: T }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('joining')

        await sendMore({
            entries: [
                ...gatesEnd({ ticket: T, ok: false, target: 'run_branch' }),
                ticketStuck({
                    ticket: T,
                    reason: 'join_gates_failed',
                    detail: 'The gates still fail after joining.',
                }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('stuck')

        await sendMore({
            entries: wholeStep({ ticket: T, step: 'undo_join', entries: [] }),
        })

        expect(await stageOf({ ticket: T })).toBe('stuck')
    })
})

describe('a refactor ticket (no test-writer, no red check)', () => {
    test('goes building, testing, reviewing, joining, done', async () => {
        await runWith({ entries: [] })
        const checkpoints: Checkpoint[] = [
            {
                at: 'worktree created',
                entries: [ticketWorktreeCreated({ ticket: 11 })],
                stage: 'building',
            },
            {
                at: 'implementer codes',
                entries: agentTurnStarts({ ticket: 11, role: 'implementer' }),
                stage: 'building',
            },
            {
                at: 'gates run',
                entries: [
                    ...agentTurnEnds({ ticket: 11, role: 'implementer' }),
                    gatesStart({ ticket: 11 }),
                ],
                stage: 'testing',
            },
            {
                at: 'reviewer reviews',
                entries: [
                    ...gatesEnd({ ticket: 11, ok: true }),
                    ...committed({ ticket: 11, stage: 'green' }),
                    ...agentTurnStarts({ ticket: 11, role: 'ticket-reviewer' }),
                ],
                stage: 'reviewing',
            },
            {
                at: 'joining the run branch',
                entries: [
                    ...agentTurnEnds({
                        ticket: 11,
                        role: 'ticket-reviewer',
                        finished: reviewFinished({ ticket: 11 }),
                    }),
                    stepStarted({ ticket: 11, step: 'join_run_branch' }),
                ],
                stage: 'joining',
            },
            {
                at: 'pushed',
                entries: [
                    ticketJoined({ ticket: 11 }),
                    stepEnded({ ticket: 11, step: 'join_run_branch' }),
                    gatesStart({ ticket: 11 }),
                    ...gatesEnd({ ticket: 11, ok: true, target: 'run_branch' }),
                    ...wholeStep({
                        ticket: 11,
                        step: 'push_run_branch',
                        entries: [runBranchPushed({ ticket: 11 })],
                    }),
                ],
                stage: 'done',
            },
        ]

        expect(await stagesAlong({ ticket: 11, checkpoints })).toEqual(
            expectedAlong({ checkpoints })
        )
        expect(await harness.ticket({ number: 11 })).toMatchObject({
            refactor: true,
        })
    })

    test('its dependent stays blocked while it joins, and starts once it is done', async () => {
        // Up to the gates on the run branch: their result and the push left.
        await runWith({ entries: refactorDone().slice(0, -5) })
        expect(await stageOf({ ticket: 11 })).toBe('joining')
        expect(await stageOf({ ticket: 12 })).toBe('blocked')

        await sendMore({ entries: refactorDone().slice(-5) })

        expect(await stageOf({ ticket: 11 })).toBe('done')
        expect(await harness.ticket({ number: 12 })).toMatchObject({
            stage: 'building',
            activity: 'queued',
        })
    })
})

describe("the final review's states and the run status", () => {
    test('the run is not stuck while another ticket is testing, fixing or joining', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                ticketStuck({ ticket: 11, reason: 'agent_failed', detail: '' }),
                ticketWorktreeCreated({ ticket: T }),
                ...agentTurnStarts({ ticket: T, role: 'test-writer' }),
                ...agentTurnEnds({ ticket: T, role: 'test-writer' }),
                stepStarted({ ticket: T, step: 'run_red_check' }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('testing')
        expect((await harness.state()).run.status).toBe('building')

        await sendMore({
            entries: [
                redCheck({ ticket: T, ok: false, failing: 0, passing: 4 }),
                stepEnded({ ticket: T, step: 'run_red_check' }),
                ...agentTurnStarts({
                    ticket: T,
                    role: 'test-writer',
                    follow_up: true,
                }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('fixing')
        expect((await harness.state()).run.status).toBe('building')

        await sendMore({
            entries: [
                ...agentTurnEnds({
                    ticket: T,
                    role: 'test-writer',
                    follow_up: true,
                }),
                ...wholeStep({
                    ticket: T,
                    step: 'run_red_check',
                    entries: [
                        redCheck({
                            ticket: T,
                            ok: true,
                            failing: 2,
                            passing: 4,
                        }),
                    ],
                }),
                ...committed({ ticket: T, stage: 'red' }),
                ...agentTurnStarts({ ticket: T, role: 'implementer' }),
                ...agentTurnEnds({ ticket: T, role: 'implementer' }),
                gatesStart({ ticket: T }),
                ...gatesEnd({ ticket: T, ok: true }),
                ...committed({ ticket: T, stage: 'green' }),
                ...agentTurnStarts({ ticket: T, role: 'ticket-reviewer' }),
                ...agentTurnEnds({
                    ticket: T,
                    role: 'ticket-reviewer',
                    finished: reviewFinished({ ticket: T }),
                }),
                stepStarted({ ticket: T, step: 'join_run_branch' }),
            ],
        })
        expect(await stageOf({ ticket: T })).toBe('joining')
        expect((await harness.state()).run.status).toBe('building')
    })

    test('a run whose tickets used the new stages reviews and ships as before', async () => {
        await runWith({
            entries: [
                ...refactorDone(),
                ...approved({ ticket: T }),
                ...joinedAndPushed({ ticket: T }),
            ],
        })
        await sendMore({
            entries: [
                ...testsCommitted({ ticket: 12 }),
                ...agentTurnStarts({ ticket: 12, role: 'implementer' }),
                ...agentTurnEnds({ ticket: 12, role: 'implementer' }),
                gatesStart({ ticket: 12 }),
                ...gatesEnd({ ticket: 12, ok: true }),
                ...committed({ ticket: 12, stage: 'green' }),
                ...agentTurnStarts({ ticket: 12, role: 'ticket-reviewer' }),
                ...agentTurnEnds({
                    ticket: 12,
                    role: 'ticket-reviewer',
                    finished: reviewFinished({ ticket: 12 }),
                }),
                // Joined, its gates on the run branch running.
                ...joinedAndPushed({ ticket: 12 }).slice(0, -5),
            ],
        })
        const joining = await harness.state()
        expect(await stageOf({ ticket: 12 })).toBe('joining')
        expect(joining.final_review).toMatchObject({
            state: 'waiting',
            active: false,
        })
        expect(joining.run.status).toBe('building')

        await sendMore({ entries: joinedAndPushed({ ticket: 12 }).slice(-5) })
        const built = await harness.state()
        expect(
            built.tickets.map(({ number, stage }) => [number, stage])
        ).toEqual([
            [11, 'done'],
            [12, 'done'],
            [13, 'done'],
        ])
        expect(built.final_review).toMatchObject({
            state: 'waiting',
            active: true,
        })

        await sendMore({
            entries: [
                engineFinalReviewStarted({ round: 1, lenses: ['security'] }),
                stepStarted({
                    ticket: null,
                    step: 'launch_lens:security-lens',
                }),
                ...engineLensTurn({
                    lens: 'security',
                    round: 1,
                    findings: [finding({ id: 'S1', severity: 'blocker' })],
                }),
                stepEnded({ ticket: null, step: 'launch_lens:security-lens' }),
            ],
        })
        const reviewing = await harness.state()
        expect(reviewing.run.status).toBe('final_review')
        expect(reviewing.final_review).toMatchObject({ round: 1 })

        await sendMore({
            entries: [
                stepStarted({ ticket: null, step: 'start_final_fix' }),
                finalReviewFixing({ round: 1 }),
                stepEnded({ ticket: null, step: 'start_final_fix' }),
                ...engineFinalFixerTurn({
                    role: 'implementer',
                    responses: [
                        { finding_id: 'S1', response: 'fixed', reason: '' },
                    ],
                }),
                stepStarted({ ticket: null, step: 'run_final_gates' }),
            ],
        })
        const fixing = await harness.state()
        expect(fixing.final_review).toMatchObject({
            state: 'fixing',
            fix_round: 1,
        })
        expect(fixing.run.status).toBe('final_review')

        await sendMore({
            entries: [
                ...engineFinalFixesLanded({ round: 1 }),
                stepEnded({ ticket: null, step: 'run_final_gates' }),
                finalReviewPassed(),
                pullRequestOpened({
                    number: 77,
                    url: 'https://github.com/o/r/pull/77',
                }),
            ],
        })
        const shipped = await harness.state()
        expect(shipped.final_review.state).toBe('passed')
        expect(shipped.run.status).toBe('done')
        expect(
            shipped.tickets.map(({ number, stage }) => [number, stage])
        ).toEqual([
            [11, 'done'],
            [12, 'done'],
            [13, 'done'],
        ])
    })
})

describe('old journals and stored board state still load', () => {
    test('an old journal with no step records replays to done without errors', async () => {
        await runWith({
            entries: [
                ...wholeTicket({ ticket: 11 }),
                ...wholeTicket({ ticket: 12 }),
                ...wholeTicket({ ticket: 13 }).slice(0, 17),
                joinClashed({ ticket: 13 }),
                ticketRebased({ ticket: 13, cause: 'clash', code: ['a.ts'] }),
            ],
        })
        expect(await stageOf({ ticket: 13 })).toBe('fixing')

        await sendMore({
            entries: [
                agentStarted({
                    ticket: 13,
                    role: 'implementer',
                    follow_up_of: sessionOf({
                        ticket: 13,
                        role: 'implementer',
                    }),
                }),
                agentFinished({ ticket: 13, role: 'implementer' }),
                gatesRun({ ticket: 13, ok: true }),
                agentStarted({ ticket: 13, role: 'ticket-reviewer' }),
                reviewFinished({ ticket: 13 }),
                ticketJoined({ ticket: 13 }),
                gatesRun({ ticket: 13, ok: true, target: 'run_branch' }),
                runBranchPushed({ ticket: 13 }),
                pullRequestOpened({
                    number: 408,
                    url: 'https://github.com/acme/app/pull/408',
                }),
            ],
        })

        const state = await harness.state()
        expect(state.run.status).toBe('done')
        expect(state.tickets.map((ticket) => ticket.stage)).toEqual([
            'done',
            'done',
            'done',
        ])
    })

    test('a stored board state parses with the old stages and the new ones', async () => {
        await runWith({ entries: wholeTicket({ ticket: 13 }) })
        const stored = JSON.parse(
            JSON.stringify(await harness.state())
        ) as BoardState
        const old = ['blocked', 'building', 'reviewing'] as const
        const withOld = {
            ...stored,
            tickets: stored.tickets.map((ticket, index) => ({
                ...ticket,
                stage: old[index % old.length],
            })),
        }
        expect(BoardStateSchema.safeParse(withOld).success).toBe(true)

        const fresh = ['testing', 'fixing', 'joining']
        const withNew = {
            ...stored,
            tickets: stored.tickets.map((ticket, index) => ({
                ...ticket,
                stage: fresh[index % fresh.length],
            })),
        }

        expect(BoardStateSchema.safeParse(withNew).success).toBe(true)
    })

    test('the stages are blocked, building, reviewing, testing, fixing, joining, stuck, done, skipped', () => {
        expect(TicketStageSchema.options).toEqual([
            'blocked',
            'building',
            'reviewing',
            'testing',
            'fixing',
            'joining',
            'stuck',
            'done',
            'skipped',
        ])
    })

    test("a stored header row's stage counts parse, old and new", () => {
        const row = {
            run_id: 'r1',
            spec_number: 10,
            spec_title: 'Spec',
            demo: false,
            status: 'building',
            counts: [{ stage: 'reviewing', count: 2 }],
            final_review: 'waiting',
            usage: null,
            limit_wait: false,
            needs_you: 0,
            pr_url: null,
            engine_ended: null,
            log_path: null,
            updated_at: '2026-09-23T12:00:00.000Z',
        }

        expect(RunRowSchema.safeParse(row).success).toBe(true)
        expect(
            RunRowSchema.safeParse({
                ...row,
                counts: [
                    { stage: 'testing', count: 1 },
                    { stage: 'fixing', count: 1 },
                    { stage: 'joining', count: 1 },
                ],
            }).success
        ).toBe(true)
    })
})

describe("the run's header row", () => {
    test('counts the tickets by what they are really doing', async () => {
        await runWith({
            entries: [
                ticketWorktreeCreated({ ticket: 11 }),
                ...agentTurnStarts({ ticket: 11, role: 'implementer' }),
                ...agentTurnEnds({ ticket: 11, role: 'implementer' }),
                gatesStart({ ticket: 11 }),
                ...reviewedOnce({ ticket: T }),
            ],
        })

        const header = harness
            .latestRows()
            .find(({ row }) => row.kind === 'luca-board-run')?.row
        expect(header).toMatchObject({
            data: {
                counts: [
                    { stage: 'blocked', count: 1 },
                    { stage: 'reviewing', count: 1 },
                    { stage: 'testing', count: 1 },
                ],
            },
        })
    })
})
