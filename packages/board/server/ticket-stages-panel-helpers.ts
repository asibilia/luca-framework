import { expect } from 'bun:test'

import { createHarness, type Harness } from './testing/board-harness'
import {
    agentFinished,
    agentStarted,
    baselineTests,
    commitMade,
    finding,
    gatesRun,
    intakeOfThree,
    leftoverScan,
    redCheck,
    reviewFinished,
    runBranchPushed,
    sessionOf,
    ticketJoined,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

/**
 * Helpers shared by the ticket stage tests (`ticket-stages-panel.test.ts`
 * and the `ticket-stages-panel-*.test.ts` files beside it).
 *
 * The harness is the one the running test started; `runWith` sets it, and
 * each test file cleans it up after every test.
 */

export let harness: Harness
export let sent = { run_id: '', token: '', next_seq: 1 }

/** Starts a run and sends intake plus `entries` in one go. */
export const runWith = async ({ entries }: { entries: Entry[] }) => {
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
export const sendMore = async ({ entries }: { entries: Entry[] }) => {
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
export const stepStarted = ({
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
export const stepEnded = ({
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
export const wholeStep = ({
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
export const agentTurnStarts = ({
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
export const agentTurnEnds = ({
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
export const committed = ({
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
export const gatesStart = ({ ticket }: { ticket: number }): Entry =>
    stepStarted({ ticket, step: 'run_gates' })

export const gatesEnd = ({
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

export const blockerOnly = [finding({ id: 'R1-1', severity: 'blocker' })]

/** One point in a ticket's life: the records up to it, and its stage then. */
export type Checkpoint = { at: string; entries: Entry[]; stage: string }

/**
 * Sends each checkpoint's records in order and reads the ticket's stage
 * after each, as `<at>: <stage>` lines, so a wrong stage names its point.
 */
export const stagesAlong = async ({
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

export const expectedAlong = ({
    checkpoints,
}: {
    checkpoints: Checkpoint[]
}): string[] => checkpoints.map(({ at, stage }) => `${at}: ${stage}`)

export const stageOf = async ({ ticket }: { ticket: number }) =>
    (await harness.ticket({ number: ticket })).stage

/** Ticket `ticket` from its worktree to its tests committed. */
export const testsCommitted = ({ ticket }: { ticket: number }): Entry[] => [
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
export const reviewedOnce = ({ ticket }: { ticket: number }): Entry[] => [
    ...testsCommitted({ ticket }),
    ...agentTurnStarts({ ticket, role: 'implementer' }),
    ...agentTurnEnds({ ticket, role: 'implementer' }),
    gatesStart({ ticket }),
    ...gatesEnd({ ticket, ok: true }),
    ...committed({ ticket, stage: 'green' }),
    ...agentTurnStarts({ ticket, role: 'ticket-reviewer' }),
]

/** Ticket `ticket` approved by its ticket review, not yet joined. */
export const approved = ({ ticket }: { ticket: number }): Entry[] => [
    ...reviewedOnce({ ticket }),
    ...agentTurnEnds({
        ticket,
        role: 'ticket-reviewer',
        finished: reviewFinished({ ticket }),
    }),
]

/** An approved ticket's join, its gates on the run branch, and the push. */
export const joinedAndPushed = ({ ticket }: { ticket: number }): Entry[] => [
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
export const refactorDone = (): Entry[] => [
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

export const T = 13
