/**
 * Carries out intake's steps on the tracker: reading the spec and its
 * tickets, and refusing the run (comments, and moving to needs-info).
 */
import { outsideBlockerNumbers } from '../intake/intake-checks'
import type { IntakeProblem } from '../intake/intake-schemas'
import type { Journal } from '../journal/journal'
import type { LabelFailure } from '../journal/journal-record'
import { postCommentOnce, type CommentStep } from '../tracker/post-comment-once'
import {
    NEEDS_INFO_LABEL,
    READY_LABEL,
    type Tracker,
    type TrackerIssue,
} from '../tracker/tracker'

/** The comment a bad spec or ticket gets when intake refuses the run. */
export const refusalComment = ({
    spec_number,
    missing,
}: {
    spec_number: number
    missing: string[]
}): string =>
    `Luca intake refused the run for spec #${spec_number}. This issue is not ready yet:\n\n` +
    `${missing.map((line) => `- ${line}`).join('\n')}\n\n` +
    `Fix these, move the issue back to \`${READY_LABEL}\`, and start the run again.`

export const readIntake = async ({
    spec_number,
    journal,
    tracker,
}: {
    spec_number: number
    journal: Journal
    tracker: Tracker
}) => {
    const spec = await tracker.readSpec({ spec_number })
    const subTickets = await tracker.listSubTickets({ spec_number })
    const outside = await Promise.all(
        outsideBlockerNumbers({ sub_tickets: subTickets }).map((number) =>
            tracker.readIssue({ number })
        )
    )
    journal.append({
        kind: 'intake_read',
        ticket: null,
        role: null,
        content: {
            spec,
            sub_tickets: subTickets,
            outside_blockers: outside.filter(
                (issue): issue is TrackerIssue => issue !== null
            ),
        },
    })
}

/**
 * Moves a refused ticket from the ready label to needs-info. A label the
 * tracker can't move doesn't stop the refusal (#500): each failure comes
 * back, to be journaled.
 */
const moveToNeedsInfo = async ({
    tracker,
    ticket,
}: {
    tracker: Tracker
    ticket: number
}): Promise<LabelFailure[]> => {
    const changes = [
        { label: NEEDS_INFO_LABEL, change: 'add' },
        { label: READY_LABEL, change: 'remove' },
    ] as const
    const failures: LabelFailure[] = []
    for (const { label, change } of changes) {
        try {
            await (change === 'add' ? tracker.addLabel : tracker.removeLabel)({
                number: ticket,
                label,
            })
        } catch (error) {
            failures.push({
                ticket,
                label,
                change,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }
    return failures
}

/**
 * Refuses the run: each bad issue gets its comment (once, even on a redo
 * after a crash) and moves to needs-info. The refusal is journaled even
 * when a label couldn't move, so the run ends refused, not crashed.
 */
export const refuseIntake = async ({
    spec_number,
    problems,
    journal,
    tracker,
    step,
}: {
    spec_number: number
    problems: IntakeProblem[]
    journal: Journal
    tracker: Tracker
    step: CommentStep
}) => {
    const labelFailures: LabelFailure[] = []
    for (const [n, { ticket, missing }] of problems.entries()) {
        if (ticket === null) continue
        await postCommentOnce({
            tracker,
            number: ticket,
            body: refusalComment({ spec_number, missing }),
            step,
            n,
        })
        labelFailures.push(...(await moveToNeedsInfo({ tracker, ticket })))
    }
    journal.append({
        kind: 'intake_refused',
        ticket: null,
        role: null,
        content: { problems, label_failures: labelFailures },
    })
}
