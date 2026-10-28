/**
 * A fresh agent's launch in the build: the run notes it gets, whether it may
 * edit tests, and the sections its prompt adds.
 */

import {
    isRefactorTicket,
    type BuildAction,
    type StepArgs,
} from './build-action'
import {
    CRASH_SECTION,
    followUpSection,
    testsUpdatedMessage,
} from './fix-loop-text'
import { handoffSection, reviewFixSection, reviewSections } from './review-text'
import { retrySection } from './stuck-text'

import { refactorUpdateSection } from '../agents/refactor-update-prompts'
import {
    CHANGESETS_LENS_SECTION,
    CHANGESETS_SECTION,
    rejoinSection,
    rolePrompt,
    testUpdateSection,
} from '../agents/role-prompts'
import type { AgentRole } from '../agents/role-results'
import type { TicketSnapshot } from '../intake/intake-schemas'
import {
    handoffRole,
    type ReplayedRunNote,
    type TicketProgress,
} from '../journal/replay'

/**
 * How many run notes a fresh agent is handed: the newest ones in the run,
 * whatever ticket or role wrote them.
 */
export const MAX_RUN_NOTES = 10

/**
 * The run notes a fresh agent gets: the `MAX_RUN_NOTES` newest, oldest
 * first. The same text written twice counts once, where it was last written.
 *
 * @example
 * newestRunNotes({ run_notes: state.run_notes }) // at most 10, oldest first
 */
export const newestRunNotes = ({
    run_notes,
}: {
    run_notes: ReplayedRunNote[]
}): ReplayedRunNote[] => {
    const seen = new Set<string>()
    const newest: ReplayedRunNote[] = []
    for (const entry of [...run_notes].reverse()) {
        if (newest.length === MAX_RUN_NOTES) break
        if (seen.has(entry.note)) continue
        seen.add(entry.note)
        newest.push(entry)
    }
    return newest.reverse()
}

/**
 * Whether an agent of this role may edit test files on this ticket: only
 * the test-writer, and a refactor ticket's implementer (who may follow
 * renames into tests). The engine hands it to the launcher's guards and
 * uses it for its own after-turn check, on launches and follow-ups alike.
 *
 * @example
 * mayEditTests({ role: 'implementer', ticket }) // true only on a refactor ticket
 */
export const mayEditTests = ({
    role,
    ticket,
}: {
    role: AgentRole
    ticket: TicketSnapshot
}): boolean =>
    role === 'test-writer' ||
    (role === 'implementer' && isRefactorTicket({ ticket }))

/**
 * The sections a launch adds: the review's (see `reviewPromptSections`),
 * and, for a test-writer or implementer fixing a ticket on top of the run
 * branch, the files that clashed. The reviewer's re-review after a rebase
 * is the review's own. The first agent after a `retry` resumed a stuck
 * ticket is also told why it got stuck, and the agent taking a turn a
 * crash cut off is told of the crash.
 */
const promptSections = ({
    role,
    progress,
}: {
    role: AgentRole
    progress: TicketProgress
}): string[] => {
    const sections = buildPromptSections({ role, progress })
    const { retried, crashed_turn, refactor_update } = progress
    return [
        ...sections,
        ...(role === 'test-writer' &&
        refactor_update !== null &&
        refactor_update.result === null
            ? [refactorUpdateSection(refactor_update)]
            : []),
        ...(retried === null ? [] : [retrySection({ retried })]),
        ...(crashed_turn === role ? [CRASH_SECTION] : []),
    ]
}

const buildPromptSections = ({
    role,
    progress,
}: {
    role: AgentRole
    progress: TicketProgress
}): string[] => {
    const review = reviewPromptSections({ role, progress })
    const { rejoin } = progress
    if (rejoin === null || role === 'ticket-reviewer') return review
    // A review fix round after the rejoin has its own findings.
    if (progress.commits.green !== null) return review
    const section = rejoinSection({ role, rejoin })
    return [
        ...review,
        ...(section === null ? [] : [section]),
        ...testUpdateSections({ role, progress }),
    ]
}

/**
 * The sections a launch adds while a test update is open (#489): the
 * test-writer's task, then, once it answered, the implementer's news.
 */
const testUpdateSections = ({
    role,
    progress,
}: {
    role: AgentRole
    progress: TicketProgress
}): string[] => {
    const update = progress.test_update
    if (update === null) return []
    if (role === 'test-writer' && update.result === null) {
        return [testUpdateSection({ since: update, bad_test: update.bad_test })]
    }
    if (role === 'implementer' && update.result !== null) {
        return [
            testsUpdatedMessage({
                bad_test: update.bad_test,
                summary: update.result.summary,
            }),
        ]
    }
    return []
}

/**
 * The sections a launch adds for the ticket review: the reviewer's diff and
 * gate results (a re-review's new changes and earlier findings), or a
 * review fixer's findings while a review fix round is open.
 */
const reviewPromptSections = ({
    role,
    progress,
}: {
    role: AgentRole
    progress: TicketProgress
}): string[] => {
    const fix = progress.review_fix
    if (role === 'ticket-reviewer') {
        return reviewSections({
            progress,
            base_sha: progress.worktree?.base_sha ?? 'HEAD',
        })
    }
    if (fix === null || progress.commits.green === null) return []
    if (role === 'test-writer' && !fix.tests_answered) {
        return [reviewFixSection({ fix, kind: 'test' })]
    }
    if (role === 'implementer' && !fix.code_answered) {
        return [reviewFixSection({ fix, kind: 'code' })]
    }
    if (role === handoffRole({ fix })) {
        return [
            handoffSection({
                fix,
                role,
                heading: `Review fix round ${fix.round}`,
            }),
        ]
    }
    return []
}

/**
 * A fresh agent session, handed the run's newest notes. With `follow_up`,
 * it stands in for a follow-up whose session is gone (a crash cut it off),
 * and its prompt carries the follow-up message.
 */
export const launch = ({
    role,
    snapshot,
    ticket,
    progress,
    run_notes,
    follow_up,
}: StepArgs & { role: AgentRole; follow_up?: string }): BuildAction => ({
    type: 'launch_agent',
    ticket: ticket.number,
    role,
    prompt: rolePrompt({
        role,
        spec: snapshot.spec,
        ticket,
        refactor: isRefactorTicket({ ticket }),
        // A test update, or a refactor one, names the bad test in its own
        // section.
        bad_test:
            progress.test_update === null && progress.refactor_update === null
                ? progress.bad_test
                : null,
        bad_test_by: progress.bad_test_source ?? undefined,
        sections: [
            ...promptSections({ role, progress }),
            ...(follow_up === undefined
                ? []
                : [followUpSection({ message: follow_up })]),
        ],
        run_notes,
    }),
    may_edit_tests: mayEditTests({ role, ticket }),
})

/**
 * A fresh test-writer's or implementer's launch (a ticket's or the final
 * review's fixers), with `section` added to its prompt, such as the repo's
 * prepare command. Any other step as it is. With `only`, just that role's
 * launches get it (the feature map is the test-writer's, #583).
 */
export const withWriterSection = ({
    step,
    section,
    only,
}: {
    step: BuildAction
    section: string
    only?: 'test-writer' | 'implementer'
}): BuildAction => {
    const writesCode =
        (step.type === 'launch_agent' || step.type === 'launch_final_fixer') &&
        (step.role === 'test-writer' || step.role === 'implementer') &&
        (only === undefined || step.role === only)
    return writesCode
        ? { ...step, prompt: `${step.prompt}\n\n${section}` }
        : step
}

/**
 * In a repo with changesets, the writers are told not to write one (#507),
 * and every reviewer (the ticket-reviewer and each lens) that the engine adds
 * the run's one at PR time (#507, #545).
 */
export const withChangesetsSections = (step: BuildAction): BuildAction =>
    step.type === 'launch_lens' ||
    (step.type === 'launch_agent' && step.role === 'ticket-reviewer')
        ? { ...step, prompt: `${step.prompt}\n\n${CHANGESETS_LENS_SECTION}` }
        : withWriterSection({ step, section: CHANGESETS_SECTION })
