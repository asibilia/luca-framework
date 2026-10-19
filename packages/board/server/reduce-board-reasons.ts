/**
 * Why a ticket, the final review, or the whole run is stuck, as codes and as
 * words: the text a stuck card shows for each reason the engine journals.
 */
import { LOOP_CAP } from '../shared/board-state'

const STUCK_REASONS: Record<string, string> = {
    agent_failed: 'An agent failed on its last try.',
    red_check_failed: 'The red check failed.',
    nothing_new_to_test:
        'The test-writer says the ticket changes no behavior, so there is nothing new to test. Label it refactor and retry it.',
    leftovers_found:
        'The leftover scan found files that must not be committed.',
    gates_failed: 'The checks failed.',
    bad_test:
        'A test was sent back as bad, by the implementer or because it checks nothing.',
    changes_requested: 'The ticket review asked for changes.',
    join_failed: "The ticket couldn't join the run branch.",
    join_gates_failed: 'The checks failed after the ticket joined.',
    install_failed: 'Installing the dependencies failed.',
    prepare_failed: "The repo's prepare command failed.",
    setup_change_needed:
        'An agent needs a test setup file changed; only you may change one.',
    crashed: 'The engine crashed in the same step again and again.',
    undo_refused:
        'Undoing its join would have rewound the run branch over other work.',
}

/** Why a retry of an edited ticket was refused, in words. */
export const RETRY_REFUSED_TEXT =
    "Its new text or labels aren't ready to build."

/** A stuck reason code in words. */
export const reasonText = ({ reason }: { reason: string }): string =>
    STUCK_REASONS[reason] ?? `${reason.replaceAll('_', ' ')}.`

/** The final review's stuck reasons that read differently from a ticket's. */
const FINAL_STUCK_REASONS: Record<string, string> = {
    changes_requested: `The lenses still ask for changes after ${LOOP_CAP} fix rounds.`,
    gates_failed: "The checks still fail on the final review's fixes.",
    bad_test:
        "The implementer sent back a bad test while fixing the final review's findings.",
}

/** A final review's stuck reason code in words. */
export const finalReasonText = ({ reason }: { reason: string }): string =>
    FINAL_STUCK_REASONS[reason] ?? reasonText({ reason })

/** Why the whole run is stuck (`run_stuck`'s reason), in words. */
const RUN_STUCK_REASONS: Record<string, string> = {
    run_budget:
        'The run used up its run budget of tokens. `retry` adds one more full budget.',
    pull_request_failed:
        "The run's pull request didn't open. `retry` tries again, reusing a PR already open from the run branch.",
}

/** A run stuck reason code in words. */
export const runReasonText = ({ reason }: { reason: string }): string =>
    RUN_STUCK_REASONS[reason] ?? `${reason.replaceAll('_', ' ')}.`
