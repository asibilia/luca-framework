/**
 * A final review round as replay rebuilds it: lens results with namespaced
 * finding ids, the round settling once every due lens is in, and the
 * fixers' answers to its fix round.
 */
import omit from 'lodash/omit'

import {
    badTestOf,
    declinedBy,
    fixerAnswered,
    handoffAnswered,
    handoffRole,
    type FinishedContent,
} from './agent-turn-replay'
import type { FinalFinding, FinalReviewState } from './final-review-state'
import { setupChangeOf } from './ticket-result-replay'

import {
    isBlocking,
    lensOf,
    type Finding,
    type LensName,
    type LensReviewResult,
} from '../agents/role-results'

/**
 * A lens's finding id, namespaced by its lens (`<lens>-<id>`), since lenses
 * choose their ids on their own. An id that already starts with the lens's
 * prefix is kept, so a re-review listing a finding again keeps its id.
 */
export const namespacedId = ({
    lens,
    id,
}: {
    lens: LensName
    id: string
}): string => (id.startsWith(`${lens}-`) ? id : `${lens}-${id}`)

/** A lens's result with every finding and ruling id namespaced. */
const namespaced = ({
    lens,
    result,
}: {
    lens: LensName
    result: LensReviewResult
}): LensReviewResult => ({
    ...result,
    findings: result.findings.map((entry) => ({
        ...entry,
        id: namespacedId({ lens, id: entry.id }),
    })),
    rulings: result.rulings.map((entry) => ({
        ...entry,
        finding_id: namespacedId({ lens, id: entry.finding_id }),
    })),
})

/**
 * A fresh-pass finding's id (#548). The fresh lenses see no earlier
 * findings, so an id they choose may already name a different earlier nit
 * or declined finding: such an id gets `fresh-` after its lens prefix. The
 * same nit found again keeps its id, so the PR lists it once.
 */
const freshId = ({
    lens,
    finding,
    earlier,
}: {
    lens: LensName
    finding: Finding
    earlier: Finding[]
}): string => {
    const clash = earlier.find(({ id }) => id === finding.id)
    if (clash === undefined) return finding.id
    const sameNit =
        !isBlocking(clash) &&
        !isBlocking(finding) &&
        clash.title === finding.title &&
        clash.file === finding.file
    return sameNit
        ? finding.id
        : `${lens}-fresh-${finding.id.slice(lens.length + 1)}`
}

/**
 * A lens's result, namespaced, with its finding ids kept apart from the
 * earlier rounds' nits and declined findings if this round is the fresh
 * pass (see `freshId`).
 */
const lensResultOf = ({
    review,
    lens,
    result,
}: {
    review: FinalReviewState
    lens: LensName
    result: LensReviewResult
}): LensReviewResult => {
    const named = namespaced({ lens, result })
    if (!review.fresh) return named
    const earlier = [
        ...review.nits,
        ...review.declined.map(({ finding }) => finding),
    ]
    return {
        ...named,
        findings: named.findings.map((finding) => ({
            ...finding,
            id: freshId({ lens, finding, earlier }),
        })),
    }
}

/**
 * Every due lens finished this round, and its slow tests ran if they were
 * due (#563): the round can settle.
 */
export const roundDone = ({ review }: { review: FinalReviewState }): boolean =>
    review.lenses_due.every((lens) => review.results[lens] !== undefined) &&
    (!review.slow_due || review.slow_tests !== null)

/**
 * The final review once every due lens finished its round (and its slow
 * tests ran, if due): settles the last fix round's "won't fix" answers per
 * lens (see `declinedBy`), keeps the nits, and opens a fix round on the
 * blocking findings of every due lens, with its fixers, gates, commit, and
 * push afresh (and fresh fixer sessions). Failed slow tests open one too,
 * even with no blocking finding (#563): its findings are empty, so only its
 * gates (and their fix loop) run. No blocking finding and no failed slow
 * test leaves `fix` null: the review is clean.
 */
export const settleRound = ({
    review,
}: {
    review: FinalReviewState
}): FinalReviewState => {
    const due = review.lenses_due.flatMap((lens) => {
        const result = review.results[lens]
        return result === undefined ? [] : [{ lens, result }]
    })
    const tagged = (lens: LensName, findings: Finding[]): FinalFinding[] =>
        findings.map((entry) => ({ ...entry, lens }))
    const declined = due.flatMap(({ lens, result }) =>
        declinedBy({
            fix:
                review.fix === null
                    ? null
                    : {
                          ...review.fix,
                          findings: review.fix.findings.filter(
                              (entry) => entry.lens === lens
                          ),
                      },
            review: result,
        }).map((entry) => ({ ...entry, lens }))
    )
    const nits = due.flatMap(({ lens, result }) =>
        tagged(
            lens,
            result.findings.filter((entry) => !isBlocking(entry))
        )
    )
    const blocking = due.flatMap(({ lens, result }) =>
        tagged(lens, result.findings.filter(isBlocking))
    )
    const settled: FinalReviewState = {
        ...review,
        declined: [...review.declined, ...declined],
        nits: [
            ...review.nits,
            ...nits.filter(
                (entry, index) =>
                    !review.nits.some(({ id }) => id === entry.id) &&
                    nits.findIndex(({ id }) => id === entry.id) === index
            ),
        ],
    }
    const slowFailed = review.slow_due && review.slow_tests?.ok === false
    if (blocking.length === 0 && !slowFailed) return { ...settled, fix: null }
    return {
        ...settled,
        fix: {
            round: review.round,
            findings: blocking,
            tests_answered: !blocking.some(({ kind }) => kind === 'test'),
            code_answered: !blocking.some(({ kind }) => kind === 'code'),
            responses: [],
            handed_off: {},
            bad_test: null,
        },
        fixing_started: false,
        sessions: omit(review.sessions, ['test-writer', 'implementer']),
        gates: null,
        gate_fix_rounds: 0,
        leftovers: null,
        commit: null,
        pushed: null,
    }
}

/**
 * Where a finished agent's result goes in the final review: a lens's
 * result this round (settling the round once every due lens finished), or
 * a fixer's answer to the open fix round. An implementer result after
 * failed gates answers a gate fix round, like a ticket's.
 */
export const finalResultChange = ({
    review,
    finished,
}: {
    review: FinalReviewState
    finished: FinishedContent
}): FinalReviewState => {
    const lens = lensOf({ role: finished.role })
    const { fix } = review
    if (lens !== null && 'verdict' in finished.result) {
        if (!review.lenses_due.includes(lens)) return review
        // The integration lens's first round gives the PR's Summary and
        // Merge Danger; a re-review's nulls keep them (#513).
        const { summary_picture, merge_danger } =
            finished.role === 'integration-lens'
                ? finished.result
                : { summary_picture: null, merge_danger: null }
        const next: FinalReviewState = {
            ...review,
            summary_picture: summary_picture ?? review.summary_picture,
            merge_danger: merge_danger ?? review.merge_danger,
            results: {
                ...review.results,
                [lens]: lensResultOf({
                    review,
                    lens,
                    result: finished.result,
                }),
            },
        }
        return roundDone({ review: next })
            ? settleRound({ review: next })
            : next
    }
    // A fixer asking for a change only the owner may make sticks the final
    // review on it (#617), like a ticket.
    const setup_change = setupChangeOf({ finished })
    if (finished.role === 'test-writer') {
        if (fix === null) return review
        const responses = finished.result.finding_responses
        if (!fix.tests_answered) {
            return {
                ...review,
                setup_change,
                fix: {
                    ...fix,
                    tests_answered: true,
                    ...fixerAnswered({ fix, role: 'test-writer', responses }),
                },
            }
        }
        if (handoffRole({ fix }) !== 'test-writer') return review
        return {
            ...review,
            setup_change,
            fix: {
                ...fix,
                ...handoffAnswered({ fix, role: 'test-writer', responses }),
            },
        }
    }
    if (finished.role === 'implementer') {
        const { result } = finished
        const responses = result.finding_responses
        if (fix !== null && fix.tests_answered && !fix.code_answered) {
            return {
                ...review,
                setup_change,
                fix: {
                    ...fix,
                    code_answered: true,
                    ...fixerAnswered({ fix, role: 'implementer', responses }),
                    bad_test: badTestOf(result),
                },
            }
        }
        if (fix !== null && handoffRole({ fix }) === 'implementer') {
            return {
                ...review,
                setup_change,
                fix: {
                    ...fix,
                    ...handoffAnswered({ fix, role: 'implementer', responses }),
                    bad_test: badTestOf(result),
                },
            }
        }
        if (review.gates === null) return review
        // An `environment` answer to failed gates reruns them, using no
        // gate fix round (#613).
        if (result.outcome === 'environment' && !review.gates.ok) {
            return {
                ...review,
                setup_change,
                gates: null,
                environment_reruns: review.environment_reruns + 1,
                environment: {
                    role: 'implementer',
                    evidence: result.environment?.evidence ?? '',
                    check: 'gates',
                    failed: review.gates,
                },
            }
        }
        return {
            ...review,
            setup_change,
            gates: null,
            gate_fix_rounds: review.gate_fix_rounds + 1,
        }
    }
    return review
}
