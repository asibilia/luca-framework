/**
 * The run's one canonical ending (#706): the `run_ended` the engine
 * journals when its loop stops on a `done` action.
 */
import type { EngineAction } from './decide'

import type { Journal } from '../journal/journal'
import type { RunEndOutcome } from '../journal/run-entries'

type DoneAction = Extract<EngineAction, { type: 'done' }>

/**
 * How a `done` action ended the run: its outcome, a line for a person, and
 * the PR's URL or `null`. Pure.
 *
 * @example
 * runEnding({ action: { type: 'done', outcome: 'all_skipped' } }) // { outcome: 'completed', detail: 'Every ticket finished without a PR.', url: null }
 */
export const runEnding = ({
    action,
}: {
    action: DoneAction
}): { outcome: RunEndOutcome; detail: string; url: string | null } => {
    switch (action.outcome) {
        case 'pr_opened':
            return {
                outcome: 'pull_request',
                detail: `The run opened its PR #${action.pull_request.number}.`,
                url: action.pull_request.url,
            }
        case 'stopped_by_user':
            return {
                outcome: 'stopped',
                detail: 'The owner replied stop, so the run ends without a PR.',
                url: null,
            }
        case 'all_skipped':
            return {
                outcome: 'completed',
                detail: 'Every ticket finished without a PR.',
                url: null,
            }
        case 'refused':
            return {
                outcome: 'refused',
                detail: 'Intake refused the spec.',
                url: null,
            }
        case 'nothing_to_do':
            return {
                outcome: 'nothing_to_do',
                detail: 'The run had nothing to do.',
                url: null,
            }
        case 'stopped':
            return {
                outcome: 'failed',
                detail: `The run stopped for good on a billing sign: ${action.reason}`,
                url: null,
            }
        case 'crashed':
            return {
                outcome: 'failed',
                detail: `The run stopped for good after crashes: ${action.reason}`,
                url: null,
            }
    }
}

/**
 * Journals the run's `run_ended` for `action`, unless the journal already
 * has one: an ending redone after a crash adds no second one.
 */
export const recordRunEnded = ({
    journal,
    action,
}: {
    journal: Journal
    action: DoneAction
}): void => {
    if (journal.read().some(({ kind }) => kind === 'run_ended')) return
    journal.append({
        kind: 'run_ended',
        ticket: null,
        role: null,
        content: runEnding({ action }),
    })
}
