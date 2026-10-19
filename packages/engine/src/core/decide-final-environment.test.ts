import { describe, expect, test } from 'bun:test'

import { decideSteps, type EngineAction } from './decide'
import { MAX_FIX_ROUNDS } from './loop-caps'

import type { GateName } from '../gates/gate-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    implemented,
    intakePassed,
    practiceTicket,
    runBranchCreated,
    SESSIONS,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import {
    finalReviewFixing,
    lensFinding,
    lensRound,
} from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * The final review's `environment` answer (#613): after the final gates
 * fail, the implementer fixer may say the failure is not the branch's
 * fault, with its evidence. The engine reruns the final gates once, using
 * no gate fix round, with the same cap as a ticket's.
 */

const EVIDENCE =
    'EADDRINUSE on port 4000: another run holds the port. I changed nothing.'

/** The one step the decision step takes after these entries. */
const stepAfter = (entries: JournalEntry[]): EngineAction => {
    const steps = decideSteps({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [practiceTicket({ number: 11 })] }),
                ...withInstalls({ entries }),
            ],
        }),
    })
    if (steps.length !== 1) {
        throw new Error(steps.map(({ type }) => type).join(', '))
    }
    return steps[0] as EngineAction
}

/** The final gates, failing only on `check`, or passing. */
const finalGates = ({
    check,
    output,
}: {
    /** `null`: every gate passes. */
    check: GateName | null
    output?: string
}): JournalEntry => ({
    kind: 'gates_run',
    ticket: null,
    role: null,
    content: {
        target: 'run_branch',
        ok: check === null,
        checks: [
            {
                name: check ?? 'test',
                command: `run ${check ?? 'test'}`,
                ok: check === null,
                exit_code: check === null ? 0 : 1,
                output: check === null ? '' : (output ?? `${check} broke`),
            },
        ],
    },
})

/** The implementer fixer's follow-up turn started. */
const followUp = (): JournalEntry =>
    agentStarted({
        ticket: null,
        role: 'implementer',
        follow_up_of: SESSIONS.implementer,
    })

/** The implementer fixer answers `environment`, with the evidence. */
const blamesEnvironment = (): JournalEntry => ({
    kind: 'agent_finished',
    ticket: null,
    role: 'implementer',
    content: {
        role: 'implementer',
        session_id: SESSIONS.implementer,
        result: {
            outcome: 'environment',
            environment: { evidence: EVIDENCE },
            summary: 'Not the branch.',
        },
    },
})

/** #11 built and pushed, a security finding, and its fixer's answer. */
const fixed = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }),
    ...lensRound({
        round: 1,
        findings: { security: [lensFinding({ id: 'S1' })] },
    }),
    finalReviewFixing({ round: 1 }),
    implemented({
        ticket: null,
        finding_responses: [
            { finding_id: 'security-S1', response: 'fixed', reason: '' },
        ],
    }),
]

/** The final gates failed on the tests, and the fixer blamed the environment. */
const blamed = ({ output }: { output?: string } = {}): JournalEntry[] => [
    ...fixed(),
    finalGates({ check: 'test', output }),
    followUp(),
    blamesEnvironment(),
]

describe("decision step: the final review's environment answer (#613)", () => {
    test('reruns the final gates once with no gate fix round counted, and a passing rerun is committed', () => {
        expect(stepAfter(blamed())).toEqual({ type: 'run_final_gates' })
        expect(
            stepAfter([...blamed(), finalGates({ check: null })])
        ).toMatchObject({ type: 'commit_final_fix', round: 1 })
        // A rerun failing another way goes on to the usual fix loop: with
        // the environment answer uncounted, the fixer still has its last
        // gate fix round after two more.
        expect(
            stepAfter([
                ...blamed(),
                ...Array.from({ length: MAX_FIX_ROUNDS - 1 }, () => [
                    finalGates({ check: 'types' }),
                    followUp(),
                    implemented({ ticket: null }),
                ]).flat(),
                finalGates({ check: 'types' }),
            ])
        ).toMatchObject({ type: 'follow_up_final_fixer', role: 'implementer' })
    })

    test('final gates that fail the same way on the rerun make the final review stuck as environment_failed, with the evidence and the output', () => {
        const output = 'EADDRINUSE: address already in use :::4000'
        const step = stepAfter([
            ...blamed({ output }),
            finalGates({ check: 'test', output }),
        ])
        expect(step).toMatchObject({
            type: 'mark_final_review_stuck',
            reason: 'environment_failed',
        })
        if (step.type !== 'mark_final_review_stuck') throw new Error(step.type)
        expect(step.detail).toContain(EVIDENCE)
        expect(step.detail).toContain(output)
    })

    test('a third environment answer at the final review makes it stuck as environment_failed', () => {
        const step = stepAfter([
            ...blamed(),
            finalGates({ check: 'types' }),
            followUp(),
            blamesEnvironment(),
            finalGates({ check: 'lint' }),
            followUp(),
            blamesEnvironment(),
        ])
        expect(step).toMatchObject({
            type: 'mark_final_review_stuck',
            reason: 'environment_failed',
        })
        if (step.type !== 'mark_final_review_stuck') throw new Error(step.type)
        expect(step.detail).toContain(EVIDENCE)
    })
})
