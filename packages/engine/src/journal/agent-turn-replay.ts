/**
 * Small pure reads of an agent turn, shared by ticket and final review
 * replay: a finished agent's assumptions and bad test, the sessions after a
 * turn, the fixer roles, and the "won't fix" answers a review let go.
 */
import omit from 'lodash/omit'

import type { JournalRecord } from './journal-record'
import type { DeclinedFinding, ReviewFix } from './ticket-progress'

import type {
    AgentRole,
    BadTest,
    ImplementerResult,
    TicketReviewResult,
} from '../agents/role-results'

export type FinishedContent = Extract<
    JournalRecord,
    { kind: 'agent_finished' }
>['content']

/** A finished agent's assumptions; the learner makes none. */
export const assumptionsOf = (finished: FinishedContent): string[] =>
    'assumptions' in finished.result ? finished.result.assumptions : []

/** A fixer's bad test, or the implementer's summary as its reason. */
export const badTestOf = (result: ImplementerResult): BadTest | null =>
    result.outcome === 'bad_test'
        ? (result.bad_test ?? { file: '', name: '', reason: result.summary })
        : null

/** The sessions after a turn: the role's latest, or none if unknown. */
export const sessionsAfter = ({
    sessions,
    role,
    session_id,
}: {
    sessions: Partial<Record<AgentRole, string>>
    role: AgentRole
    session_id: string | null
}): Partial<Record<AgentRole, string>> => {
    const rest = omit(sessions, role)
    return session_id === null ? rest : { ...rest, [role]: session_id }
}

export const isFixerRole = (role: AgentRole): boolean =>
    role === 'test-writer' || role === 'implementer'

/**
 * The fixers' "won't fix" answers the new review let go: its ruling was
 * `accepted`, or it gave none and did not list the finding again.
 */
export const declinedBy = ({
    fix,
    review,
}: {
    fix: Pick<ReviewFix, 'findings' | 'responses'> | null
    review: TicketReviewResult
}): DeclinedFinding[] => {
    if (fix === null) return []
    const listed = new Set(review.findings.map(({ id }) => id))
    return fix.responses.flatMap(({ finding_id, response, reason }) => {
        if (response !== 'wont_fix') return []
        const finding = fix.findings.find(({ id }) => id === finding_id)
        if (finding === undefined) return []
        const ruling = review.rulings.find(
            (entry) => entry.finding_id === finding_id
        )
        const accepted =
            ruling === undefined
                ? !listed.has(finding_id)
                : ruling.ruling === 'accepted'
        return accepted
            ? [{ finding, reason, ruling: ruling?.reason ?? '' }]
            : []
    })
}
