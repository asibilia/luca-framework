import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { LENS_NAMES, type Finding, type LensName } from '../agents/role-results'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    gatesRun,
    implemented,
    testsWritten,
    ticketPath,
    worktreesRemoved,
} from '../testing/build-fixtures'
import {
    finalReviewFixing,
    finalReviewPassed,
    finalReviewShipped,
    finalReviewStarted,
    finalReviewStuck,
    lensFinding,
    lensReviewed,
    lensRound,
    slowTestsRun,
} from '../testing/final-review-fixtures'
import {
    built,
    fixesLanded,
    lensPrompt,
    NIT,
    SECURITY,
    securityFixRound,
    stepAfter,
    stepsAfter,
} from '../testing/final-review-steps'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1, the final review's fresh pass (#548): once a fix commit was
 * pushed since round 1 and no blocking finding is left, every lens reads
 * the whole run branch once more, fresh, before the PR opens. Its blocking
 * findings get one fix round and one re-check, and what is still open
 * tops the PR.
 */

const FRESH_BLOCKER = lensFinding({
    id: 'S2',
    severity: 'blocker',
    title: 'Sum overflows silently',
})
const FRESH_NIT = lensFinding({
    id: 'N2',
    severity: 'nit',
    title: 'Name the reducer',
})
const RULES = [{ path: 'AGENTS.md', text: 'Name every file in kebab-case.' }]
const NOTE = 'The fixers ran bun test on the whole branch.'

/** The step that starts the fresh pass after `fixedAndClean`. */
const FRESH_START = {
    type: 'start_final_review',
    round: 3,
    from_sha: 'b0',
    lenses: [...LENS_NAMES],
    fresh: true,
}

/** `built`, with a run note from ticket #11's test-writer. */
const builtWithNote = (): JournalEntry[] =>
    built().map((entry) =>
        entry.kind === 'agent_finished' && entry.role === 'test-writer'
            ? testsWritten({ ticket: 11, run_notes: [NOTE] })
            : entry
    )

/**
 * Round 1's security finding and nit, fix round 1 declining the finding
 * (pushed as `fix-1`), and round 2 accepting that: no blocking finding is
 * left, after a fix commit.
 */
const fixedAndClean = (): JournalEntry[] => [
    ...builtWithNote(),
    ...lensRound({
        round: 1,
        findings: { security: [SECURITY], simplification: [NIT] },
    }),
    finalReviewFixing({ round: 1 }),
    implemented({
        ticket: null,
        finding_responses: [
            {
                finding_id: 'security-S1',
                response: 'wont_fix',
                reason: 'Inputs are typed numbers.',
            },
        ],
    }),
    ...fixesLanded({ sha: 'fix-1' }),
    finalReviewStarted({
        round: 2,
        from_sha: 'g1',
        head_sha: 'fix-1',
        lenses: ['security'],
        files: ['src/sum.ts'],
    }),
    ...lensReviewed({
        lens: 'security',
        round: 2,
        rulings: [
            {
                finding_id: 'security-S1',
                ruling: 'accepted',
                reason: 'The types already guard it.',
            },
        ],
    }),
]

/** The fresh pass's `final_review_started`, of the whole branch. */
const freshStarted = ({
    round,
    head_sha,
}: {
    round: number
    head_sha: string
}): JournalEntry =>
    finalReviewStarted({
        round,
        from_sha: 'b0',
        head_sha,
        rules: RULES,
        fresh: true,
    })

/** The fresh pass after `fixedAndClean`, with these findings per lens. */
const freshRound = (
    findings: Partial<Record<LensName, Finding[]>>
): JournalEntry[] => [
    freshStarted({ round: 3, head_sha: 'fix-1' }),
    ...LENS_NAMES.flatMap((lens) =>
        lensReviewed({ lens, round: 3, findings: findings[lens] })
    ),
]

/** The fresh pass's blocker (and a nit), fixed in fix round 3 and pushed as `fix-3`. */
const freshFixed = (): JournalEntry[] => [
    ...fixedAndClean(),
    ...freshRound({ security: [FRESH_BLOCKER], simplification: [FRESH_NIT] }),
    finalReviewFixing({ round: 3 }),
    implemented({
        ticket: null,
        session_id: 'impl-3',
        finding_responses: [
            { finding_id: 'security-S2', response: 'fixed', reason: '' },
        ],
    }),
    ...fixesLanded({ sha: 'fix-3' }),
]

/** The security lens re-checking the fresh pass's fix, with these findings. */
const reChecked = (findings: Finding[]): JournalEntry[] => [
    finalReviewStarted({
        round: 4,
        from_sha: 'fix-1',
        head_sha: 'fix-3',
        lenses: ['security'],
        files: ['src/sum.ts'],
    }),
    ...lensReviewed({ lens: 'security', round: 4, findings }),
]

const prBody = (entries: JournalEntry[]): string => {
    const pr = stepAfter(entries)
    if (pr.type !== 'open_pull_request') throw new Error(pr.type)
    return pr.body
}

describe('decision step: when the fresh pass runs (#548)', () => {
    test('once a fix round was pushed and no blocking finding is left, a fresh pass of every lens starts instead of passing', () => {
        expect(stepAfter(fixedAndClean())).toMatchObject(FRESH_START)
    })

    test('a fix round opened only by failing slow tests leads to a fresh pass too', () => {
        const step = stepAfter([
            ...built(),
            ...lensRound({ round: 1, slow_due: true }),
            slowTestsRun({ ok: false }),
            finalReviewFixing({ round: 1 }),
            gatesRun({ ticket: null, target: 'run_branch', ok: false }),
            agentStarted({ ticket: null, role: 'implementer' }),
            implemented({ ticket: null }),
            ...fixesLanded({ sha: 'fix-1' }),
        ])

        expect(step).toMatchObject({
            type: 'start_final_review',
            round: 2,
            from_sha: 'b0',
            lenses: [...LENS_NAMES],
            fresh: true,
        })
    })

    test('a final review with no fix rounds passes as today, with no fresh pass', () => {
        const noFix = [
            ...built(),
            ...lensRound({ round: 1, findings: { simplification: [NIT] } }),
        ]

        expect(stepAfter(noFix)).toEqual({ type: 'pass_final_review' })
        expect(stepAfter(fixedAndClean())).toMatchObject({ fresh: true })
    })

    test('there is at most one fresh pass per final review, and none after a ship reply', () => {
        expect(stepAfter(fixedAndClean())).toMatchObject(FRESH_START)
        expect(stepAfter([...freshFixed(), ...reChecked([])])).toEqual({
            type: 'pass_final_review',
        })

        const shipped = [
            ...built(),
            ...lensRound({ round: 1, findings: { security: [SECURITY] } }),
            ...securityFixRound({ round: 1 }),
            ...lensRound({
                round: 2,
                lenses: ['security'],
                from_sha: 'g1',
                head_sha: 'fix-1',
                findings: { security: [SECURITY] },
            }),
            finalReviewStuck({ reason: 'changes_requested' }),
            worktreesRemoved({ paths: [ticketPath(11)] }),
            finalReviewShipped(),
        ]
        expect(prBody(shipped).startsWith('## Open findings')).toBe(true)
    })

    test('final_review_started records fresh: true for the fresh pass, and false otherwise and in older journals', () => {
        const [older, fresh] = recordsFrom({
            entries: [
                finalReviewStarted({ round: 1 }),
                freshStarted({ round: 3, head_sha: 'fix-1' }),
            ],
        })

        expect(older).toMatchObject({ content: { fresh: false } })
        expect(fresh).toMatchObject({ content: { fresh: true } })
    })
})

describe("decision step: the fresh pass's prompts (#548)", () => {
    const freshSteps = () =>
        stepsAfter([
            ...fixedAndClean(),
            freshStarted({ round: 3, head_sha: 'fix-1' }),
        ])

    test("the fresh pass launches all five lenses, each a new agent, with round 1's prompt of the whole branch", () => {
        expect(stepAfter(fixedAndClean())).toMatchObject(FRESH_START)
        const steps = freshSteps()

        expect(
            steps.map((step) =>
                step.type === 'launch_lens' ? step.lens : step.type
            )
        ).toEqual([...LENS_NAMES])
        for (const lens of LENS_NAMES) {
            const prompt = lensPrompt(steps, lens)
            expect(prompt).toContain(`# Your role: ${lens}-lens`)
            expect(prompt).toContain('git diff b0..fix-1')
            expect(prompt).toContain('- src/sum.ts')
            expect(prompt).toContain('## Spec #10: Practice spec')
            expect(prompt).toContain('### Ticket #11: Add sum')
            expect(prompt).toContain('- AC1: sum adds two numbers')
            expect(prompt).toContain('- test (`bun test`): passed')
            expect(prompt).toContain(NOTE)
        }
        const rules = lensPrompt(steps, 'rules')
        expect(rules).toContain('### AGENTS.md')
        expect(rules).toContain('Name every file in kebab-case.')
    })

    test("the fresh pass's prompts hold no earlier findings, fixer answers, rulings or declined findings", () => {
        expect(stepAfter(fixedAndClean())).toMatchObject(FRESH_START)
        const steps = freshSteps()

        for (const lens of LENS_NAMES) {
            const prompt = lensPrompt(steps, lens)
            for (const earlier of [
                'security-S1',
                'Sum trusts its input',
                'simplification-N1',
                'Inputs are typed numbers.',
                'The types already guard it.',
                'Fixer:',
                'review ONLY the new changes',
                're-review',
            ]) {
                expect(prompt).not.toContain(earlier)
            }
        }
    })
})

describe("decision step: the fresh pass's findings (#548)", () => {
    test("the fresh pass's blocking findings get one fix round through the usual fixers and gates", () => {
        expect(stepAfter(fixedAndClean())).toMatchObject(FRESH_START)
        const fresh = [
            ...fixedAndClean(),
            ...freshRound({
                security: [FRESH_BLOCKER],
                simplification: [FRESH_NIT],
            }),
        ]

        expect(stepAfter(fresh)).toEqual({ type: 'start_final_fix', round: 3 })
        const fixer = stepAfter([...fresh, finalReviewFixing({ round: 3 })])
        expect(fixer).toMatchObject({
            type: 'launch_final_fixer',
            role: 'implementer',
            may_edit_tests: false,
        })
        if (fixer.type !== 'launch_final_fixer') throw new Error(fixer.type)
        expect(fixer.prompt).toContain(
            'security-S2 [blocker, code] (src/sum.ts): Sum overflows silently'
        )
        expect(fixer.prompt).not.toContain('simplification-N2')

        const answered = freshFixed().slice(0, -4)
        expect(stepAfter(answered)).toEqual({ type: 'run_final_gates' })
        expect(stepAfter(freshFixed().slice(0, -2))).toEqual({
            type: 'commit_final_fix',
            round: 3,
            message: 'fix: final review round 3 for spec #10',
        })
    })

    test('after that fix round, the lenses with blocking fresh findings re-check it, and what they still hold open tops the PR', () => {
        expect(stepAfter(fixedAndClean())).toMatchObject(FRESH_START)
        const reCheck = stepAfter(freshFixed())
        expect(reCheck).toMatchObject({
            type: 'start_final_review',
            round: 4,
            from_sha: 'fix-1',
            lenses: ['security'],
        })
        expect(reCheck).not.toMatchObject({ fresh: true })
        const prompt = lensPrompt(
            stepsAfter([...freshFixed(), ...reChecked([]).slice(0, 1)]),
            'security'
        )
        expect(prompt).toContain('review ONLY the new changes')
        expect(prompt).toContain('git diff fix-1..fix-3')
        expect(prompt).toContain('security-S2')
        expect(prompt).toContain('Fixer: fixed.')

        const stillOpen = [...freshFixed(), ...reChecked([FRESH_BLOCKER])]
        expect(stepAfter(stillOpen)).toEqual({ type: 'pass_final_review' })
        const body = prBody([...stillOpen, finalReviewPassed()])
        expect(body.startsWith('## Open findings')).toBe(true)
        expect(body).toContain(
            '- security lens, blocker (src/sum.ts): security-S2 Sum overflows silently'
        )
    })

    test("the fresh pass's findings never make the final review stuck, even after the fix round cap", () => {
        const reviewRound = (round: number, findings: Finding[]) =>
            lensRound({
                round,
                lenses: ['security'],
                from_sha: round === 2 ? 'g1' : `fix-${round - 2}`,
                head_sha: `fix-${round - 1}`,
                findings: { security: findings },
            })
        const capped = [
            ...built(),
            ...lensRound({ round: 1, findings: { security: [SECURITY] } }),
            ...securityFixRound({ round: 1 }),
            ...reviewRound(2, [SECURITY]),
            ...securityFixRound({ round: 2 }),
            ...reviewRound(3, [SECURITY]),
            ...securityFixRound({ round: 3 }),
            ...reviewRound(4, []),
        ]
        expect(stepAfter(capped)).toMatchObject({
            type: 'start_final_review',
            round: 5,
            from_sha: 'b0',
            lenses: [...LENS_NAMES],
            fresh: true,
        })

        const fresh = [
            ...capped,
            freshStarted({ round: 5, head_sha: 'fix-3' }),
            ...LENS_NAMES.flatMap((lens) =>
                lensReviewed({
                    lens,
                    round: 5,
                    findings: lens === 'security' ? [FRESH_BLOCKER] : [],
                })
            ),
        ]
        expect(stepAfter(fresh)).toEqual({ type: 'start_final_fix', round: 5 })
        const stillOpen = [
            ...fresh,
            finalReviewFixing({ round: 5 }),
            implemented({
                ticket: null,
                session_id: 'impl-5',
                finding_responses: [
                    {
                        finding_id: 'security-S2',
                        response: 'fixed',
                        reason: '',
                    },
                ],
            }),
            ...fixesLanded({ sha: 'fix-5' }),
            ...lensRound({
                round: 6,
                lenses: ['security'],
                from_sha: 'fix-3',
                head_sha: 'fix-5',
                findings: { security: [FRESH_BLOCKER] },
            }),
        ]
        expect(stepAfter(stillOpen)).toEqual({ type: 'pass_final_review' })
    })

    test("failing gates in the fresh pass's fix round use the usual gate fix loop and its cap", () => {
        expect(stepAfter(fixedAndClean())).toMatchObject(FRESH_START)
        const failedGates = gatesRun({
            ticket: null,
            target: 'run_branch',
            ok: false,
        })
        const answered = freshFixed().slice(0, -4)
        const followUp = stepAfter([...answered, failedGates])
        expect(followUp).toMatchObject({
            type: 'follow_up_final_fixer',
            role: 'implementer',
            session_id: 'impl-3',
        })
        if (followUp.type !== 'follow_up_final_fixer') {
            throw new Error(followUp.type)
        }
        expect(followUp.message).toContain('The gates failed.')

        const gateFix = implemented({ ticket: null, session_id: 'impl-3' })
        expect(
            stepAfter([
                ...answered,
                failedGates,
                gateFix,
                failedGates,
                gateFix,
                failedGates,
                gateFix,
                failedGates,
            ])
        ).toMatchObject({
            type: 'mark_final_review_stuck',
            reason: 'gates_failed',
        })
    })

    test("the fresh pass's nits go to the PR's nits", () => {
        expect(stepAfter(fixedAndClean())).toMatchObject(FRESH_START)
        const nitsOnly = [
            ...fixedAndClean(),
            ...freshRound({ simplification: [FRESH_NIT] }),
        ]

        expect(stepAfter(nitsOnly)).toEqual({ type: 'pass_final_review' })
        expect(prBody([...nitsOnly, finalReviewPassed()])).toContain(
            'final review, simplification lens: simplification-N2 (src/sum.ts): Name the reducer'
        )
    })

    test("a fresh nit that reuses an earlier nit's id with other content still goes to the PR's nits", () => {
        expect(stepAfter(fixedAndClean())).toMatchObject(FRESH_START)
        const reused = lensFinding({
            id: 'N1',
            severity: 'nit',
            title: 'Name the reducer',
        })
        const nitsOnly = [
            ...fixedAndClean(),
            ...freshRound({ simplification: [reused] }),
        ]

        expect(stepAfter(nitsOnly)).toEqual({ type: 'pass_final_review' })
        const body = prBody([...nitsOnly, finalReviewPassed()])
        expect(body).toContain(
            'final review, simplification lens: simplification-N1 (src/sum.ts): Shorter name'
        )
        expect(body).toContain(
            'final review, simplification lens: simplification-fresh-N1 (src/sum.ts): Name the reducer'
        )
    })
})

describe('the glossary on the fresh pass (#548)', () => {
    test('the glossary has Fresh pass: every lens reads the whole branch again, without earlier findings, after the last fix round', async () => {
        const root = join(import.meta.dir, '../../../..')
        const glossary = await Bun.file(join(root, 'GLOSSARY.md')).text()
        const entry = glossary.match(/^\*\*Fresh pass\*\*:\n(.+)\n(.+)$/m)

        expect(entry?.[1]?.toLowerCase()).toBe(
            "the final review's last read before the pull request, in which every lens reads the whole branch again, without earlier findings, after the last fix round."
        )
        expect(entry?.[2]).toBe('_Avoid_: re-review, second review')
    })
})
