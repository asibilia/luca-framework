/**
 * Journal records about waits between steps (#558, #559): the engine's
 * `ticket_waiting`, and hand-built journals shaped like two real runs whose
 * waits the board once showed as nothing. Their folders are gone (umc3) or
 * too big to commit (p9dr, 33 MB), so these copy their shape, not their
 * bytes.
 */
import { entry, type Entry } from './journal-fixture-base'
import { agentFinished, agentStarted } from './journal-fixtures-agents'
import {
    baselineTests,
    dependenciesInstalled,
    intakeRead,
    runBranchCreated,
    runBranchPushed,
    runStarted,
    specSnapshot,
    ticketSnapshot,
    ticketWorktreeCreated,
} from './journal-fixtures-run'
import {
    commitMade,
    gatesRun,
    leftoverScan,
    redCheck,
    reviewFinished,
    ticketJoined,
} from './journal-fixtures-tickets'

/** What a ticket waits for between steps. */
export type WaitFor = 'baseline' | 'join' | 'start'

/**
 * `ticket_waiting` as the engine journals it, once, when a wait between
 * steps starts: `baseline` for another ticket's shared baseline tests,
 * `join` for the join queue, `start` for the start queue. `on_ticket` is
 * the ticket it waits on. The ticket's next `step_started` ends it.
 */
export const ticketWaiting = ({
    ticket,
    waiting_for,
    on_ticket,
    since,
}: {
    ticket: number
    waiting_for: WaitFor
    on_ticket: number | null
    since: string
}): Entry =>
    entry({
        kind: 'ticket_waiting',
        ticket,
        content: { for: waiting_for, on_ticket, since },
    })

/**
 * `repo_wait_started` (#615): before intake, the run waits for the earlier
 * runs on its repo that are going.
 */
export const repoWaitStarted = ({
    runs,
}: {
    runs: { run_id: string; spec: number | null }[]
}): Entry => entry({ kind: 'repo_wait_started', content: { runs } })

/** `repo_wait_ended`: no earlier run on the repo is going anymore. */
export const repoWaitEnded = (): Entry =>
    entry({ kind: 'repo_wait_ended', content: {} })

/** `step_started` of a ticket's step (`key` is its number). */
export const stepOn = ({
    ticket,
    step,
    role = null,
}: {
    ticket: number
    step: string
    role?: string | null
}): Entry =>
    entry({
        kind: 'step_started',
        ticket,
        role,
        content: { key: String(ticket), step, first_seq: null },
    })

/** `step_ended` of a ticket's step. */
export const stepOff = ({
    ticket,
    step,
    role = null,
}: {
    ticket: number
    step: string
    role?: string | null
}): Entry =>
    entry({
        kind: 'step_ended',
        ticket,
        role,
        content: { key: String(ticket), step },
    })

/** A whole step of a ticket: its start, its records, and its end. */
export const stepOf = ({
    ticket,
    step,
    role = null,
    entries,
}: {
    ticket: number
    step: string
    role?: string | null
    entries: Entry[]
}): Entry[] => [
    stepOn({ ticket, step, role }),
    ...entries,
    stepOff({ ticket, step, role }),
]

/** Intake of spec `spec` with these tickets, in order, and the run branch. */
export const intakeOf = ({
    spec,
    tickets,
}: {
    spec: number
    tickets: { number: number; blockers?: number[] }[]
}): Entry[] => [
    runStarted({ spec }),
    intakeRead({ spec }),
    specSnapshot({
        spec,
        title: `Spec ${spec}`,
        order: tickets.map(({ number }) => number),
    }),
    ...tickets.map(({ number, blockers }) =>
        ticketSnapshot({ number, title: `Ticket ${number}`, blockers })
    ),
    runBranchCreated({ branch: `luca/run-${spec}` }),
]

/** A ticket's worktree made and its packages installed, as whole steps. */
export const worktreeReady = ({ ticket }: { ticket: number }): Entry[] => [
    ...stepOf({
        ticket,
        step: 'create_ticket_worktree',
        entries: [ticketWorktreeCreated({ ticket })],
    }),
    ...stepOf({
        ticket,
        step: 'install_dependencies',
        entries: [dependenciesInstalled({ ticket, ok: true })],
    }),
]

/** An agent's whole turn as one step. */
const turn = ({
    ticket,
    role,
    finished,
}: {
    ticket: number
    role: string
    finished?: Entry
}): Entry[] =>
    stepOf({
        ticket,
        step: `launch_agent:${role}`,
        role,
        entries: [
            agentStarted({ ticket, role }),
            finished ?? agentFinished({ ticket, role }),
        ],
    })

/** A ticket from its worktree up to its implementer's turn starting. */
export const upToImplementer = ({ ticket }: { ticket: number }): Entry[] => [
    ...worktreeReady({ ticket }),
    ...stepOf({
        ticket,
        step: 'run_baseline_tests',
        entries: [baselineTests({ ticket, passed: 4 })],
    }),
    ...turn({ ticket, role: 'test-writer' }),
    ...stepOf({
        ticket,
        step: 'run_red_check',
        entries: [redCheck({ ticket, ok: true, failing: 2, passing: 4 })],
    }),
    ...stepOf({
        ticket,
        step: 'commit_ticket',
        entries: [
            leftoverScan({ ticket, stage: 'red' }),
            commitMade({ ticket, stage: 'red' }),
        ],
    }),
    stepOn({ ticket, step: 'launch_agent:implementer', role: 'implementer' }),
    agentStarted({ ticket, role: 'implementer' }),
]

/** A ticket from its implementer's turn to its review's turn starting. */
export const upToReview = ({ ticket }: { ticket: number }): Entry[] => [
    ...upToImplementer({ ticket }),
    agentFinished({ ticket, role: 'implementer' }),
    stepOff({ ticket, step: 'launch_agent:implementer', role: 'implementer' }),
    ...stepOf({
        ticket,
        step: 'run_gates',
        entries: [gatesRun({ ticket, ok: true })],
    }),
    ...stepOf({
        ticket,
        step: 'commit_ticket',
        entries: [
            leftoverScan({ ticket, stage: 'green' }),
            commitMade({ ticket, stage: 'green' }),
        ],
    }),
    stepOn({
        ticket,
        step: 'launch_agent:ticket-reviewer',
        role: 'ticket-reviewer',
    }),
    agentStarted({ ticket, role: 'ticket-reviewer' }),
]

/** The ticket review's approval, ending its turn. */
export const approvalEnds = ({ ticket }: { ticket: number }): Entry[] => [
    reviewFinished({ ticket }),
    stepOff({
        ticket,
        step: 'launch_agent:ticket-reviewer',
        role: 'ticket-reviewer',
    }),
]

/** An approved ticket's join, as a whole step. */
export const joinStep = ({ ticket }: { ticket: number }): Entry[] =>
    stepOf({
        ticket,
        step: 'join_run_branch',
        entries: [ticketJoined({ ticket })],
    })

/** The checks on the run branch after a join, and the push. */
export const joinChecksAndPush = ({ ticket }: { ticket: number }): Entry[] => [
    ...stepOf({
        ticket,
        step: 'run_gates',
        entries: [gatesRun({ ticket, ok: true, target: 'run_branch' })],
    }),
    ...stepOf({
        ticket,
        step: 'push_run_branch',
        entries: [runBranchPushed({ ticket })],
    }),
]

/** A ticket built, approved, joined and pushed: done. */
export const doneTicket = ({ ticket }: { ticket: number }): Entry[] => [
    ...upToReview({ ticket }),
    ...approvalEnds({ ticket }),
    ...joinStep({ ticket }),
    ...joinChecksAndPush({ ticket }),
]

/** The umc3 run's tickets: #553 runs the shared baseline the rest wait on. */
export const UMC3_TICKETS = [553, 554, 555, 556, 557]

/**
 * Shaped like run umc3 up to seq 72 (an old journal: no `ticket_waiting`):
 * spec #552's five tickets all get their worktree from the same run-branch
 * commit and install their packages; then #553 runs the baseline tests
 * they share, and #554–#557 wait for it with no step of their own.
 */
export const umc3UpToSeq72 = (): Entry[] => [
    ...intakeOf({
        spec: 552,
        tickets: UMC3_TICKETS.map((number) => ({ number })),
    }),
    ...UMC3_TICKETS.flatMap((ticket) =>
        stepOf({
            ticket,
            step: 'create_ticket_worktree',
            entries: [ticketWorktreeCreated({ ticket })],
        })
    ),
    ...UMC3_TICKETS.flatMap((ticket) =>
        stepOf({
            ticket,
            step: 'install_dependencies',
            entries: [dependenciesInstalled({ ticket, ok: true })],
        })
    ),
    stepOn({ ticket: 553, step: 'run_baseline_tests' }),
]

/**
 * Shaped like run p9dr up to seq 1070 (an old journal: no
 * `ticket_waiting`), on asibilia/heartgold-plus: #328 is done; #331's
 * review approved it first, it joined, and the checks on the run branch
 * are running; #329's review approved it after, so it waits in the join
 * queue; #330's implementer is at work.
 */
export const p9drUpToSeq1070 = (): Entry[] => [
    ...intakeOf({
        spec: 326,
        tickets: [
            { number: 328 },
            { number: 329 },
            { number: 330 },
            { number: 331 },
        ],
    }),
    ...doneTicket({ ticket: 328 }),
    ...upToReview({ ticket: 331 }),
    ...upToReview({ ticket: 329 }),
    ...upToImplementer({ ticket: 330 }),
    ...approvalEnds({ ticket: 331 }),
    ...joinStep({ ticket: 331 }),
    stepOn({ ticket: 331, step: 'run_gates' }),
    ...approvalEnds({ ticket: 329 }),
]
