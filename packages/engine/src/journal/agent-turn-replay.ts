/**
 * Small pure reads of an agent turn, shared by ticket and final review
 * replay: a finished agent's assumptions and bad test, the sessions after a
 * turn, the out-of-turns counts, the fixer roles, a fix round's answers and `other_role` hand-offs,
 * and the "won't fix" answers a review let go.
 */
import omit from 'lodash/omit'
import uniq from 'lodash/uniq'

import type { JournalRecord } from './journal-record'
import type { DeclinedFinding, ReviewFix, WriterRole } from './ticket-progress'

import type {
    AgentRole,
    BadTest,
    FindingResponse,
    ImplementerResult,
    TicketReviewResult,
} from '../agents/role-results'
import { DEFAULT_MODEL } from '../config/engine-config'

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

/** The out-of-turns counts after a failed turn (#543): one more for its role if it reached its limit. */
export const outOfTurnsAfter = ({
    counts,
    failed,
}: {
    counts: Partial<Record<AgentRole, number>>
    failed: { role: AgentRole; out_of_turns: boolean }
}): Partial<Record<AgentRole, number>> =>
    failed.out_of_turns
        ? { ...counts, [failed.role]: (counts[failed.role] ?? 0) + 1 }
        : counts

export const isFixerRole = (role: AgentRole): boolean =>
    role === 'test-writer' || role === 'implementer'

const OTHER_ROLE: Record<WriterRole, WriterRole> = {
    'test-writer': 'implementer',
    implementer: 'test-writer',
}

type FixAnswers = Pick<ReviewFix, 'findings' | 'responses' | 'handed_off'>

/**
 * A fixer's answers in its fix round, kept, with the round's findings it
 * answered `other_role` handed to the other writer role (#616).
 */
export const fixerAnswered = ({
    fix,
    role,
    responses,
}: {
    fix: FixAnswers
    role: WriterRole
    responses: FindingResponse[]
}): Pick<ReviewFix, 'responses' | 'handed_off'> => {
    const handed = responses.flatMap(({ finding_id, response }) =>
        response === 'other_role' &&
        fix.findings.some(({ id }) => id === finding_id)
            ? [finding_id]
            : []
    )
    const other = OTHER_ROLE[role]
    return {
        responses: [...fix.responses, ...responses],
        handed_off:
            handed.length === 0
                ? fix.handed_off
                : {
                      ...fix.handed_off,
                      [other]: uniq([
                          ...(fix.handed_off[other] ?? []),
                          ...handed,
                      ]),
                  },
    }
}

/**
 * The other role's answers to the findings handed to it (#616). Each one
 * replaces the first fixer's `other_role`, and is final: a second
 * `other_role` counts as `wont_fix`. Answers to findings not handed to it
 * are dropped.
 */
export const handoffAnswered = ({
    fix,
    role,
    responses,
}: {
    fix: FixAnswers
    role: WriterRole
    responses: FindingResponse[]
}): Pick<ReviewFix, 'responses' | 'handed_off'> => {
    const ids = fix.handed_off[role] ?? []
    const answers = responses.flatMap((answer) => {
        if (!ids.includes(answer.finding_id)) return []
        return answer.response === 'other_role'
            ? [{ ...answer, response: 'wont_fix' as const }]
            : [answer]
    })
    const answered = new Set(answers.map(({ finding_id }) => finding_id))
    return {
        responses: [
            ...fix.responses.filter(
                ({ finding_id }) => !answered.has(finding_id)
            ),
            ...answers,
        ],
        handed_off: omit(fix.handed_off, role),
    }
}

/**
 * The writer role a fix round hands findings to next, once its fixers
 * answered: the test-writer first, then the implementer. `null` with none,
 * or while a fixer has yet to answer.
 */
export const handoffRole = ({
    fix,
}: {
    fix: Pick<ReviewFix, 'handed_off' | 'tests_answered' | 'code_answered'>
}): WriterRole | null => {
    if (!fix.tests_answered || !fix.code_answered) return null
    return (
        (['test-writer', 'implementer'] as const).find(
            (role) => (fix.handed_off[role] ?? []).length > 0
        ) ?? null
    )
}

/**
 * Whether a fixer's answer declines its finding: `wont_fix`, or an
 * `other_role` the other role never answered (#616).
 */
export const isDeclined = ({ response }: FindingResponse): boolean =>
    response === 'wont_fix' || response === 'other_role'

/**
 * Whether an agent launched on a model cheaper than Opus (#604). Older
 * journals name no model, and ran Opus.
 */
export const ranCheaper = (model: string | null | undefined): boolean =>
    model !== null && model !== undefined && model !== DEFAULT_MODEL

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
    return fix.responses.flatMap((answer) => {
        const { finding_id, reason } = answer
        if (!isDeclined(answer)) return []
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
