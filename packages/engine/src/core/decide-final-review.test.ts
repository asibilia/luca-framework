import { describe, expect, test } from 'bun:test'

import { MAX_ENGINE_FAILURES, MAX_FIX_ROUNDS } from './loop-caps'

import { LENS_NAMES } from '../agents/role-results'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentFailed,
    agentStarted,
    commitMade,
    gatesRun,
    implemented,
    leftoverScan,
    RUN_BRANCH,
    SESSIONS,
    testsWritten,
} from '../testing/build-fixtures'
import {
    finalReviewFixing,
    finalReviewPassed,
    finalReviewStarted,
    lensReviewed,
    lensRound,
} from '../testing/final-review-fixtures'
import {
    ARCH_TEST,
    built,
    findingsRound,
    fixersAnswered,
    fixesLanded,
    lensPrompt,
    SECURITY,
    securityFixRound,
    stepAfter,
    stepsAfter,
} from '../testing/final-review-steps'

/**
 * Seam 1, the final review: the decision step given a journal in which
 * every ticket pushed. The whole run branch is reviewed by five lenses
 * before the PR opens. A stuck final review and the PR's Summary are in
 * `decide-final-review-pr.test.ts`, the fresh pass in
 * `decide-final-review-fresh.test.ts`; the shared journal is in
 * `testing/final-review-steps.ts`.
 */

describe('decision step: the final review runs before the PR', () => {
    test('a one-ticket spec gets a final review of the whole run branch before its PR', () => {
        expect(stepAfter(built())).toEqual({
            type: 'start_final_review',
            round: 1,
            from_sha: 'b0',
            lenses: [...LENS_NAMES],
        })
    })

    test('the five lenses launch at once, each a fresh reviewer of the whole branch', () => {
        const steps = stepsAfter([...built(), finalReviewStarted({ round: 1 })])

        expect(
            steps.map((step) =>
                step.type === 'launch_lens'
                    ? `${step.lens} ${step.role}`
                    : step.type
            )
        ).toEqual([
            'architecture architecture-lens',
            'simplification simplification-lens',
            'security security-lens',
            'integration integration-lens',
            'rules rules-lens',
        ])
        const prompt = lensPrompt(steps, 'security')
        expect(prompt).toContain('# Your role: security-lens')
        expect(prompt).toContain('git diff b0..g1')
        expect(prompt).toContain('- src/sum.ts')
        expect(prompt).toContain('## Spec #10: Practice spec')
        expect(prompt).toContain('### Ticket #11: Add sum')
        expect(prompt).toContain('- AC1: sum adds two numbers')
        expect(prompt).toContain('- test (`bun test`): passed')
        expect(prompt).not.toContain('re-review')
    })

    test("the rules lens gets the config's rule files word for word, and a note for a missing one", () => {
        const steps = stepsAfter([
            ...built(),
            finalReviewStarted({
                round: 1,
                rules: [
                    {
                        path: 'AGENTS.md',
                        text: 'Name every file in kebab-case.',
                    },
                    { path: '~/.claude/rules/gone.md', text: null },
                ],
            }),
        ])

        const rules = lensPrompt(steps, 'rules')
        expect(rules).toContain('### AGENTS.md')
        expect(rules).toContain('Name every file in kebab-case.')
        expect(rules).toContain('### ~/.claude/rules/gone.md')
        expect(rules).toContain('The engine could not read this file.')
        expect(lensPrompt(steps, 'security')).not.toContain('kebab-case')
    })

    test('a lens still reviewing keeps the others from moving on', () => {
        const steps = stepsAfter([
            ...built(),
            finalReviewStarted({ round: 1 }),
            ...lensReviewed({ lens: 'architecture', round: 1 }),
        ])

        expect(steps.map((step) => step.type)).toEqual([
            'launch_lens',
            'launch_lens',
            'launch_lens',
            'launch_lens',
        ])
    })

    test('every lens clean passes the final review, then the PR opens', () => {
        const clean = [...built(), ...lensRound({ round: 1 })]

        expect(stepAfter(clean)).toEqual({ type: 'pass_final_review' })
        expect(stepAfter([...clean, finalReviewPassed()])).toMatchObject({
            type: 'open_pull_request',
            head: RUN_BRANCH,
        })
    })
})

describe('decision step: final review findings loop', () => {
    test('findings open a fix round: test findings to a fresh test-writer first', () => {
        const round = [...built(), ...findingsRound()]

        expect(stepAfter(round)).toEqual({ type: 'start_final_fix', round: 1 })
        const fixer = stepAfter([...round, finalReviewFixing({ round: 1 })])
        expect(fixer).toMatchObject({
            type: 'launch_final_fixer',
            role: 'test-writer',
            may_edit_tests: true,
        })
        if (fixer.type !== 'launch_final_fixer') throw new Error(fixer.type)
        expect(fixer.prompt).toContain("fixing the final review's findings")
        expect(fixer.prompt).toContain('whole run branch')
        expect(fixer.prompt).toContain(
            'architecture-A1 [blocker, test] (src/sum.test.ts): The tests reach into private helpers'
        )
        expect(fixer.prompt).not.toContain('security-S1')
        expect(fixer.prompt).not.toContain('simplification-N1')
    })

    test('then code findings go to a fresh implementer on the whole branch', () => {
        const step = stepAfter([
            ...built(),
            ...findingsRound(),
            ...fixersAnswered({ security: 'fixed' }).slice(0, 2),
        ])

        expect(step).toMatchObject({
            type: 'launch_final_fixer',
            role: 'implementer',
            may_edit_tests: false,
        })
        if (step.type !== 'launch_final_fixer') throw new Error(step.type)
        expect(step.prompt).toContain(
            'security-S1 [should-fix, code] (src/sum.ts): Sum trusts its input'
        )
        expect(step.prompt).not.toContain('architecture-A1')
    })

    test("a later fix round starts a fresh implementer, not the last round's session", () => {
        const step = stepAfter([
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
            finalReviewFixing({ round: 2 }),
        ])

        expect(step).toMatchObject({
            type: 'launch_final_fixer',
            role: 'implementer',
        })
    })

    test('the fixes run the gates, and failed gates go back to the implementer session', () => {
        const answered = [
            ...built(),
            ...findingsRound(),
            ...fixersAnswered({ security: 'fixed' }),
        ]

        expect(stepAfter(answered)).toEqual({ type: 'run_final_gates' })
        const failed = [
            ...answered,
            gatesRun({ ticket: null, target: 'run_branch', ok: false }),
        ]
        const followUp = stepAfter(failed)
        expect(followUp).toMatchObject({
            type: 'follow_up_final_fixer',
            role: 'implementer',
            session_id: SESSIONS.implementer,
        })
        if (followUp.type !== 'follow_up_final_fixer') {
            throw new Error(followUp.type)
        }
        expect(followUp.message).toContain('The gates failed.')
        expect(followUp.message).toContain('1 fail')
        expect(
            stepAfter([
                ...failed,
                agentStarted({
                    ticket: null,
                    role: 'implementer',
                    follow_up_of: SESSIONS.implementer,
                }),
                implemented({ ticket: null }),
            ])
        ).toEqual({ type: 'run_final_gates' })
    })

    test(`gates still failing after ${MAX_FIX_ROUNDS} gate fix rounds make the final review stuck`, () => {
        const failedGates = gatesRun({
            ticket: null,
            target: 'run_branch',
            ok: false,
        })
        const step = stepAfter([
            ...built(),
            ...findingsRound(),
            ...fixersAnswered({ security: 'fixed' }),
            failedGates,
            implemented({ ticket: null }),
            failedGates,
            implemented({ ticket: null }),
            failedGates,
            implemented({ ticket: null }),
            failedGates,
        ])

        expect(step).toMatchObject({
            type: 'mark_final_review_stuck',
            reason: 'gates_failed',
        })
    })

    test('with only test findings, failed gates go to a fresh implementer with the failure', () => {
        const step = stepAfter([
            ...built(),
            ...lensRound({ round: 1, findings: { architecture: [ARCH_TEST] } }),
            finalReviewFixing({ round: 1 }),
            testsWritten({ ticket: null }),
            gatesRun({ ticket: null, target: 'run_branch', ok: false }),
        ])

        expect(step).toMatchObject({
            type: 'launch_final_fixer',
            role: 'implementer',
            may_edit_tests: false,
        })
        if (step.type !== 'launch_final_fixer') throw new Error(step.type)
        expect(step.prompt).toContain('The gates failed.')
        expect(step.prompt).toContain('1 fail')
    })

    test('passing gates are committed on the run branch, then pushed', () => {
        const passed = [
            ...built(),
            ...findingsRound(),
            ...fixersAnswered({ security: 'fixed' }),
            gatesRun({ ticket: null, target: 'run_branch', ok: true }),
        ]

        expect(stepAfter(passed)).toEqual({
            type: 'commit_final_fix',
            round: 1,
            message: 'fix: final review round 1 for spec #10',
        })
        expect(
            stepAfter([
                ...passed,
                leftoverScan({ ticket: null, stage: 'fix' }),
                commitMade({ ticket: null, stage: 'fix', sha: 'fix-1' }),
            ])
        ).toEqual({ type: 'push_final_fixes', branch: RUN_BRANCH })
    })

    test('leftovers in the fixes make the final review stuck', () => {
        const step = stepAfter([
            ...built(),
            ...findingsRound(),
            ...fixersAnswered({ security: 'fixed' }),
            gatesRun({ ticket: null, target: 'run_branch', ok: true }),
            leftoverScan({
                ticket: null,
                stage: 'fix',
                hits: [{ path: 'notes.md', reason: 'a new markdown file' }],
            }),
        ])

        expect(step).toMatchObject({
            type: 'mark_final_review_stuck',
            reason: 'leftovers_found',
        })
        if (step.type !== 'mark_final_review_stuck') throw new Error(step.type)
        expect(step.detail).toContain('notes.md')
    })

    test('an implementer sending a test back as bad while fixing makes it stuck', () => {
        const step = stepAfter([
            ...built(),
            ...lensRound({ round: 1, findings: { security: [SECURITY] } }),
            finalReviewFixing({ round: 1 }),
            implemented({ ticket: null, outcome: 'bad_test' }),
        ])

        expect(step).toMatchObject({
            type: 'mark_final_review_stuck',
            reason: 'bad_test',
        })
    })

    test('after the push, only the lenses with blocking findings re-review only the new changes', () => {
        const pushedFixes = [
            ...built(),
            ...findingsRound(),
            ...fixersAnswered({ security: 'fixed' }),
            ...fixesLanded({ sha: 'fix-1' }),
        ]

        expect(stepAfter(pushedFixes)).toEqual({
            type: 'start_final_review',
            round: 2,
            from_sha: 'g1',
            lenses: ['architecture', 'security'],
        })
        const steps = stepsAfter([
            ...pushedFixes,
            finalReviewStarted({
                round: 2,
                from_sha: 'g1',
                head_sha: 'fix-1',
                lenses: ['architecture', 'security'],
                files: ['src/sum.ts'],
            }),
        ])
        expect(
            steps.map((step) =>
                step.type === 'launch_lens' ? step.lens : step.type
            )
        ).toEqual(['architecture', 'security'])
        const prompt = lensPrompt(steps, 'security')
        expect(prompt).toContain('review ONLY the new changes')
        expect(prompt).toContain('git diff g1..fix-1')
        expect(prompt).toContain('security-S1')
        expect(prompt).toContain('Fixer: fixed.')
        expect(prompt).not.toContain('architecture-A1')
        expect(prompt).toContain('"accepted" lets the finding go')
    })

    test('pushback accepted by the re-review is declined, and listed in the PR with the nits', () => {
        const declined = [
            ...built(),
            ...findingsRound(),
            ...fixersAnswered({ security: 'wont_fix' }),
            ...fixesLanded({ sha: 'fix-1' }),
            finalReviewStarted({
                round: 2,
                from_sha: 'g1',
                head_sha: 'fix-1',
                lenses: ['architecture', 'security'],
            }),
            ...lensReviewed({ lens: 'architecture', round: 2 }),
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

        const reReview = lensPrompt(
            stepsAfter(declined.slice(0, -8)),
            'security'
        )
        expect(reReview).toContain(
            "Fixer: WON'T FIX. Reason: Inputs are typed numbers."
        )
        // A fresh pass comes between (#548); see decide-final-review-fresh.
        const pr = stepAfter([...declined, finalReviewPassed()])
        if (pr.type !== 'open_pull_request') throw new Error(pr.type)
        expect(pr.body).toContain('final review, security lens: security-S1')
        expect(pr.body).toContain("Won't fix: Inputs are typed numbers.")
        expect(pr.body).toContain('The types already guard it.')
        expect(pr.body).toContain(
            'final review, simplification lens: simplification-N1 (src/sum.ts): Shorter name'
        )
    })

    test(`a final review still asking for changes after ${MAX_FIX_ROUNDS} fix rounds is stuck`, () => {
        const reviewRound = (round: number): JournalEntry[] =>
            lensRound({
                round,
                lenses: round === 1 ? undefined : ['security'],
                from_sha: round === 1 ? 'b0' : `fix-${round - 1}`,
                head_sha: round === 1 ? 'g1' : `fix-${round}`,
                findings: { security: [SECURITY] },
            })
        const step = stepAfter([
            ...built(),
            ...reviewRound(1),
            ...securityFixRound({ round: 1 }),
            ...reviewRound(2),
            ...securityFixRound({ round: 2 }),
            ...reviewRound(3),
            ...securityFixRound({ round: 3 }),
            ...reviewRound(4),
        ])

        expect(step).toMatchObject({
            type: 'mark_final_review_stuck',
            reason: 'changes_requested',
        })
        if (step.type !== 'mark_final_review_stuck') throw new Error(step.type)
        expect(step.detail).toContain(
            `still asks for changes after ${MAX_FIX_ROUNDS} fix rounds`
        )
        expect(step.detail).toContain('security-S1')
    })
})

describe('decision step: failed lens and fixer turns', () => {
    const fourClean = (): JournalEntry[] => [
        ...built(),
        finalReviewStarted({ round: 1 }),
        ...(
            ['architecture', 'simplification', 'integration', 'rules'] as const
        ).flatMap((lens) => lensReviewed({ lens, round: 1 })),
    ]
    const securityFailed = (failure: 'result' | 'engine'): JournalEntry[] => [
        agentStarted({ ticket: null, role: 'security-lens' }),
        agentFailed({ ticket: null, role: 'security-lens', failure }),
    ]

    test('a failed lens try gets a fresh lens, until its tries run out', () => {
        const once = [...fourClean(), ...securityFailed('result')]
        expect(stepAfter(once)).toMatchObject({
            type: 'launch_lens',
            lens: 'security',
            role: 'security-lens',
        })

        const out = [
            ...once,
            ...securityFailed('result'),
            ...securityFailed('result'),
        ]
        expect(stepAfter(out)).toMatchObject({
            type: 'mark_final_review_stuck',
            reason: 'agent_failed',
        })
    })

    test(`${MAX_ENGINE_FAILURES} engine failures of a lens in a row are stuck`, () => {
        const twice = [
            ...fourClean(),
            ...securityFailed('engine'),
            ...securityFailed('engine'),
        ]
        expect(stepAfter(twice)).toMatchObject({ type: 'launch_lens' })
        expect(
            stepAfter([...twice, ...securityFailed('engine')])
        ).toMatchObject({
            type: 'mark_final_review_stuck',
            reason: 'agent_failed',
        })
    })

    test('a failed fixer try gets a follow-up in its session', () => {
        const step = stepAfter([
            ...built(),
            ...lensRound({ round: 1, findings: { security: [SECURITY] } }),
            finalReviewFixing({ round: 1 }),
            agentStarted({ ticket: null, role: 'implementer' }),
            agentFailed({
                ticket: null,
                role: 'implementer',
                failure: 'guard',
                error: '- wrote src/sum.test.ts, which the implementer may not write',
            }),
        ])

        expect(step).toMatchObject({
            type: 'follow_up_final_fixer',
            role: 'implementer',
            session_id: SESSIONS.implementer,
        })
        if (step.type !== 'follow_up_final_fixer') throw new Error(step.type)
        expect(step.message).toContain(
            'changed things your role may not change'
        )
    })
})
