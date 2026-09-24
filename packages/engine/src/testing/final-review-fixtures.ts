import {
    LENS_NAMES,
    lensRole,
    type Finding,
    type FindingRuling,
    type LensName,
} from '../agents/role-results'
import type { JournalEntry, StuckReason } from '../journal/journal-record'

/**
 * Journal entry builders for the final review, so decision-step tests can
 * write a journal that stops anywhere in it. Final review records have
 * `ticket: null`; see `build-fixtures.ts` for the fixers' records (pass
 * `ticket: null`).
 */

/** A final review round started, reviewing `from_sha..head_sha`. */
export const finalReviewStarted = ({
    round,
    from_sha,
    head_sha,
    lenses,
    files,
    rules,
}: {
    round: number
    /** Defaults to `b0`, where the fixtures' run branch starts. */
    from_sha?: string
    /** Defaults to `g1`, the fixtures' last push. */
    head_sha?: string
    /** Defaults to every lens. */
    lenses?: LensName[]
    /** Defaults to `src/sum.ts` and its test. */
    files?: string[]
    rules?: { path: string; text: string | null }[]
}): JournalEntry => ({
    kind: 'final_review_started',
    ticket: null,
    role: null,
    content: {
        round,
        from_sha: from_sha ?? 'b0',
        head_sha: head_sha ?? 'g1',
        lenses: lenses ?? [...LENS_NAMES],
        files: files ?? ['src/sum.test.ts', 'src/sum.ts'],
        rules: rules ?? [],
    },
})

/** One lens finding: a code should-fix in `src/sum.ts` unless told otherwise. */
export const lensFinding = ({
    id,
    severity,
    kind,
    title,
    file,
}: {
    id: string
    severity?: 'blocker' | 'should_fix' | 'nit'
    kind?: 'code' | 'test'
    title?: string
    file?: string | null
}): Finding => ({
    id,
    severity: severity ?? 'should_fix',
    kind: kind ?? 'code',
    file: file === undefined ? 'src/sum.ts' : file,
    title: title ?? `Finding ${id}`,
    detail: `Detail of ${id}.`,
})

/**
 * A lens's turn, from its `lens_started` to its `lens_finished`, with these
 * findings (none: it approves). The verdict follows the findings.
 */
export const lensReviewed = ({
    lens,
    round,
    findings,
    rulings,
    assumptions,
}: {
    lens: LensName
    round: number
    findings?: Finding[]
    rulings?: FindingRuling[]
    assumptions?: string[]
}): JournalEntry[] => {
    const list = findings ?? []
    const role = lensRole({ lens })
    const count = (severity: Finding['severity']) =>
        list.filter((entry) => entry.severity === severity).length
    return [
        {
            kind: 'lens_started',
            ticket: null,
            role: null,
            content: { lens, round },
        },
        {
            kind: 'agent_started',
            ticket: null,
            role,
            content: { role, prompt: 'p', follow_up_of: null },
        },
        {
            kind: 'agent_finished',
            ticket: null,
            role,
            content: {
                role,
                session_id: `${lens}-${round}`,
                result: {
                    verdict: list.some(({ severity }) => severity !== 'nit')
                        ? 'changes_requested'
                        : 'approve',
                    findings: list,
                    rulings: rulings ?? [],
                    summary: `The ${lens} lens looked.`,
                    assumptions: assumptions ?? [],
                },
            },
        },
        {
            kind: 'lens_finished',
            ticket: null,
            role: null,
            content: {
                lens,
                round,
                findings: {
                    blocker: count('blocker'),
                    should_fix: count('should_fix'),
                    nit: count('nit'),
                },
            },
        },
    ]
}

/**
 * A whole final review round: its start, then each due lens's turn, with
 * the findings given per lens (a lens not named approves).
 */
export const lensRound = ({
    round,
    lenses,
    findings,
    from_sha,
    head_sha,
}: {
    round: number
    /** Defaults to every lens. */
    lenses?: LensName[]
    findings?: Partial<Record<LensName, Finding[]>>
    from_sha?: string
    head_sha?: string
}): JournalEntry[] => {
    const due = lenses ?? [...LENS_NAMES]
    return [
        finalReviewStarted({ round, lenses: due, from_sha, head_sha }),
        ...due.flatMap((lens) =>
            lensReviewed({ lens, round, findings: findings?.[lens] })
        ),
    ]
}

/** A final review fix round starts. */
export const finalReviewFixing = ({
    round,
}: {
    round: number
}): JournalEntry => ({
    kind: 'final_review_fixing',
    ticket: null,
    role: null,
    content: { round },
})

export const finalReviewPassed = (): JournalEntry => ({
    kind: 'final_review_passed',
    ticket: null,
    role: null,
    content: {},
})

export const finalReviewStuck = ({
    reason,
    detail,
}: {
    reason: StuckReason
    /** Defaults to "why". */
    detail?: string
}): JournalEntry => ({
    kind: 'final_review_stuck',
    ticket: null,
    role: null,
    content: { reason, detail: detail ?? 'why' },
})

export const finalReviewShipped = (): JournalEntry => ({
    kind: 'final_review_shipped',
    ticket: null,
    role: null,
    content: {},
})

/**
 * A clean final review: round 1, every lens approving, and its pass. Put it
 * after every ticket's push to reach the PR.
 */
export const finalReviewClean = (): JournalEntry[] => [
    ...lensRound({ round: 1 }),
    finalReviewPassed(),
]

/** The owner's `retry` started the stuck final review's fix round over. */
export const finalReviewRetried = (): JournalEntry => ({
    kind: 'final_review_retried',
    ticket: null,
    role: null,
    content: {},
})
