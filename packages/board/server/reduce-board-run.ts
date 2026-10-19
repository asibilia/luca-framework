/**
 * The run's own records: how it starts and resumes, intake and the spec's
 * snapshot, the run branch, the pull request, and a stop.
 */
import type { BoardRecord, LeftOutList } from './board-vocabulary'
import { numbersText } from './reduce-board-text'
import { updateTicket, withTried } from './reduce-board-update'

import {
    DEFAULT_RUN_BUDGET_TOKENS,
    type BoardState,
    type PersonTicket,
    type RunInfo,
} from '../shared/board-state'
import { repoOfIssueUrl } from '../shared/reply-actions'

/**
 * The run's version note after a resume on Luca `resumed_on`: both versions
 * when it differs from the one the run started on, else the note so far (a
 * run that once changed version keeps saying so). Nothing when the journal
 * doesn't say what the run started on.
 */
const versionNote = ({
    run,
    resumed_on,
}: {
    run: RunInfo
    resumed_on: string
}): string | null =>
    run.started_on === null || run.started_on === resumed_on
        ? run.version_note
        : `This run started on Luca ${run.started_on} and resumed on Luca ${resumed_on}. It keeps going.`

/**
 * The tickets left out for a person (#499), with why in words, as the
 * engine's PR says it.
 *
 * @example
 * personTickets({ left_out: [{ number: 13, title: 'Link', reason: 'waits_on_person', waits_on: [12], through: [] }] })
 * // [{ number: 13, title: 'Link', why: 'waits on #12, which is for a person' }]
 */
const personTickets = ({
    left_out,
}: {
    left_out: LeftOutList
}): PersonTicket[] =>
    left_out.map(({ number, title, reason, waits_on, through }) => {
        if (reason === 'for_a_person') {
            return { number, title, why: 'for a person' }
        }
        const which =
            waits_on.length === 1
                ? 'which is for a person'
                : 'which are for a person'
        const via =
            through.length === 0
                ? ''
                : ` (through ${numbersText({ numbers: through })})`
        return {
            number,
            title,
            why: `waits on ${numbersText({ numbers: waits_on })}, ${which}${via}`,
        }
    })

/**
 * The spec's owner and repo from intake's copy of the spec issue, keeping
 * what the board knew when the record lacks them (older journals).
 */
const specOwner = ({
    run,
    spec,
}: {
    run: RunInfo
    spec: { author?: string; url?: string }
}): Pick<RunInfo, 'spec_author' | 'spec_repo'> => ({
    spec_author:
        spec.author === undefined || spec.author === ''
            ? run.spec_author
            : spec.author,
    spec_repo:
        (spec.url === undefined ? null : repoOfIssueUrl({ url: spec.url })) ??
        run.spec_repo,
})

/** The record kinds the run's own records. */
export const RUN_KINDS = [
    'run_started',
    'engine_resumed',
    'config_reloaded',
    'config_reload_refused',
    'intake_read',
    'intake_refused',
    'nothing_to_do',
    'spec_snapshot',
    'run_branch_created',
    'run_stopped',
    'pull_request_opened',
    'worktrees_removed',
] as const

type RunRecord = Extract<BoardRecord, { kind: (typeof RUN_KINDS)[number] }>

/** Applies one record of RUN_KINDS to the board. */
export const applyRunKind = ({
    state,
    record,
}: {
    state: BoardState
    record: RunRecord
}): BoardState => {
    const { ticket } = record
    switch (record.kind) {
        case 'run_started': {
            const budget =
                record.content.config?.run_budget_tokens ??
                DEFAULT_RUN_BUDGET_TOKENS
            return {
                ...state,
                run_budget_tokens: budget,
                run_budget_each: budget,
                run: {
                    ...state.run,
                    spec_number: record.content.spec_number,
                    phase: 'intake',
                    started_on: record.content.luca_version,
                },
            }
        }
        case 'engine_resumed':
            return {
                ...state,
                run: {
                    ...state.run,
                    version_note: versionNote({
                        run: state.run,
                        resumed_on: record.content.luca_version,
                    }),
                },
            }
        // A resume's config reload (#516) is only a chat row.
        case 'config_reloaded':
        case 'config_reload_refused':
            return state
        case 'intake_read':
            return {
                ...state,
                run: {
                    ...state.run,
                    spec_title:
                        state.run.spec_title ?? record.content.spec.title,
                    phase: 'intake',
                    ...specOwner({ run: state.run, spec: record.content.spec }),
                },
            }
        case 'intake_refused':
            return {
                ...state,
                run: {
                    ...state.run,
                    phase: 'refused',
                    refusal: record.content.problems.map(
                        (problem) =>
                            `${problem.ticket === null ? 'The run' : `#${problem.ticket}`}: missing ${problem.missing.join(', ')}`
                    ),
                },
            }
        case 'nothing_to_do':
            return {
                ...state,
                for_a_person: personTickets({
                    left_out: record.content.left_out,
                }),
                run: { ...state.run, phase: 'nothing_to_do' },
            }
        case 'spec_snapshot':
            return {
                ...state,
                for_a_person: personTickets({
                    left_out: record.content.left_out,
                }),
                run: {
                    ...state.run,
                    spec_number: record.content.spec.number,
                    spec_title: record.content.spec.title,
                    phase: 'building',
                    ...specOwner({ run: state.run, spec: record.content.spec }),
                },
            }
        case 'run_branch_created':
            return {
                ...state,
                run: { ...state.run, branch: record.content.branch },
            }
        case 'run_stopped': {
            const { reason, role, billing, crashed } = record.content
            const stopped = updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    role: null,
                    activity: 'run stopped',
                    tried: withTried({
                        tried: card.tried,
                        line: `${billing ? 'Stopped for billing' : crashed ? 'Stopped after crashes' : 'The run stopped'}: ${reason}`,
                    }),
                }),
            })
            return {
                ...stopped,
                run: {
                    ...stopped.run,
                    stopped: {
                        reason,
                        role,
                        ticket,
                        billing,
                        crashed,
                        since: record.time,
                    },
                },
            }
        }
        case 'pull_request_opened':
            return {
                ...state,
                run: {
                    ...state.run,
                    phase: 'done',
                    pr_url: record.content.url,
                    pr_number: record.content.number,
                },
            }
        // Removing the worktrees at the end changes nothing on the board.
        case 'worktrees_removed':
            return state
    }
}
