/**
 * The steps the engine journals: the one a ticket is in, or the ones the
 * run itself is running, and the stage a step puts a ticket in.
 */
import type { BoardRecord } from './board-vocabulary'
import { roleWords } from './reduce-board-text'
import { updateTicket } from './reduce-board-update'

import type { BoardState, TicketCard, TicketStage } from '../shared/board-state'

/** A step's action type in words, when it reads better than its name. */
const STEP_WORDS: Record<string, string> = {
    install_dependencies: 'installing packages',
    run_baseline_tests: 'running the baseline tests',
    run_red_check: 'running the red check',
    run_gates: 'running the checks',
    run_final_gates: 'running the checks',
    run_final_slow_tests: 'running the slow tests',
    join_run_branch: 'joining the run branch',
    push_run_branch: 'pushing the run branch',
    push_final_fixes: 'pushing the run branch',
    write_changeset: 'writing the changeset',
    open_pull_request: 'opening the pull request',
    mark_already_done: 'noting the work is already done',
    close_ticket: 'closing the ticket',
}

/**
 * A `step_started`'s step in words: an agent's turn (`<type>:<role>`)
 * waits for its role; any other step as `STEP_WORDS` has it, else its
 * action type.
 *
 * @example
 * stepText({ step: 'run_gates' }) // 'running the checks'
 * stepText({ step: 'follow_up_agent:implementer' }) // 'waiting for the implementer'
 */
export const stepText = ({ step }: { step: string }): string => {
    const colon = step.indexOf(':')
    if (colon >= 0) {
        return `waiting for the ${roleWords({ role: step.slice(colon + 1) })}`
    }
    return STEP_WORDS[step] ?? step.replaceAll('_', ' ')
}

/** The run's running steps, and the newest of them as its current step. */
const withRunSteps = ({
    state,
    run_steps,
}: {
    state: BoardState
    run_steps: BoardState['run_steps']
}): BoardState => {
    const newest = run_steps.at(-1)
    return {
        ...state,
        run_steps,
        current_step: newest
            ? { text: newest.text, since: newest.since }
            : null,
    }
}

/** No step running anywhere: the engine ended, or the run stopped. */
export const withoutSteps = ({ state }: { state: BoardState }): BoardState =>
    withRunSteps({
        state: {
            ...state,
            tickets: state.tickets.map((card) =>
                card.current_step === null
                    ? card
                    : { ...card, current_step: null }
            ),
        },
        run_steps: [],
    })

/** The stages a step doesn't move a ticket out of. */
const SETTLED_STAGES = new Set<TicketStage>(['stuck', 'done', 'skipped'])

/**
 * The stage a ticket's step puts it in (#549): the red check and the checks
 * are testing, but the checks after joining are still joining; joining and
 * pushing the run branch are joining. Any other step, or a stuck, done or
 * skipped ticket, keeps its stage.
 */
const stepStage = ({
    card,
    step,
}: {
    card: TicketCard
    step: string
}): TicketStage => {
    if (SETTLED_STAGES.has(card.stage)) return card.stage
    switch (step) {
        case 'run_red_check':
            return 'testing'
        case 'run_gates':
            return card.stage === 'joining' ? 'joining' : 'testing'
        case 'join_run_branch':
        case 'push_run_branch':
            return 'joining'
        default:
            return card.stage
    }
}

/**
 * A step began: it is its ticket's current step, or one of the run's, and
 * it sets the ticket's stage. A new step on the same key (a crash's redo)
 * replaces the one before it.
 */
const stepStarted = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'step_started' }>
}): BoardState => {
    // A replayed journal of an engine that ended has no step running.
    const ended = state.run.engine_ended !== null
    const current_step = {
        text: stepText({ step: record.content.step }),
        since: record.time,
    }
    if (record.ticket !== null) {
        return updateTicket({
            state,
            number: record.ticket,
            update: (card) => ({
                ...card,
                stage: stepStage({ card, step: record.content.step }),
                current_step: ended ? card.current_step : current_step,
            }),
        })
    }
    if (ended) return state
    const { key } = record.content
    return withRunSteps({
        state,
        run_steps: [
            ...state.run_steps.filter((step) => step.key !== key),
            { key, ...current_step },
        ],
    })
}

const stepEnded = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'step_ended' }>
}): BoardState => {
    if (record.ticket !== null) {
        return updateTicket({
            state,
            number: record.ticket,
            update: (card) => ({ ...card, current_step: null }),
        })
    }
    return withRunSteps({
        state,
        run_steps: state.run_steps.filter(
            (step) => step.key !== record.content.key
        ),
    })
}

/** The record kinds of a step. */
export const STEP_KINDS = ['step_started', 'step_ended'] as const

type StepRecord = Extract<BoardRecord, { kind: (typeof STEP_KINDS)[number] }>

/** Applies one record of STEP_KINDS to the board. */
export const applyStepKind = ({
    state,
    record,
}: {
    state: BoardState
    record: StepRecord
}): BoardState => {
    switch (record.kind) {
        case 'step_started':
            return stepStarted({ state, record })
        case 'step_ended':
            return stepEnded({ state, record })
    }
}
