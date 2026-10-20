import {
    commitMade,
    gatesRun,
    implemented,
    intakePassed,
    leftoverScan,
    practiceTicket,
    pushed,
    runBranchCreated,
    testsWritten,
    ticketBuilt,
    withInstalls,
} from './build-fixtures'
import {
    finalReviewFixing,
    lensFinding,
    lensRound,
} from './final-review-fixtures'
import { recordsFrom } from './intake-fixtures'

import { decideSteps, type EngineAction } from '../core/decide'
import type { JournalEntry } from '../journal/journal-record'

/**
 * The final review's decision-step tests' shared journal: practice ticket
 * #11 built and pushed, its lens findings, and its fix rounds, with the
 * steps the decision step takes after them.
 */

export const TICKET = practiceTicket({ number: 11 })

/** Every step the decision step can take now, after these entries. */
export const stepsAfter = (
    entries: JournalEntry[],
    tickets = [TICKET]
): EngineAction[] =>
    decideSteps({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets }),
                ...withInstalls({ entries }),
            ],
        }),
    })

/** The one step the decision step takes after these entries. */
export const stepAfter = (entries: JournalEntry[]): EngineAction => {
    const steps = stepsAfter(entries)
    if (steps.length !== 1) {
        throw new Error(steps.map(({ type }) => type).join(', '))
    }
    return steps[0] as EngineAction
}

/** The run branch with ticket #11 built, joined, and pushed. */
export const built = (): JournalEntry[] => [
    runBranchCreated(),
    ...ticketBuilt({ ticket: 11 }),
]

/** The prompt of the `launch_lens` step for this lens. */
export const lensPrompt = (steps: EngineAction[], lens: string): string => {
    const step = steps.find(
        (entry) => entry.type === 'launch_lens' && entry.lens === lens
    )
    if (step?.type !== 'launch_lens') throw new Error(`no ${lens} lens`)
    return step.prompt
}

export const SECURITY = lensFinding({ id: 'S1', title: 'Sum trusts its input' })
export const ARCH_TEST = lensFinding({
    id: 'A1',
    kind: 'test',
    severity: 'blocker',
    title: 'The tests reach into private helpers',
    file: 'src/sum.test.ts',
})
export const NIT = lensFinding({
    id: 'N1',
    severity: 'nit',
    title: 'Shorter name',
})

/** Round 1 with a code finding (security), a test finding (architecture), and a nit. */
export const findingsRound = (): JournalEntry[] =>
    lensRound({
        round: 1,
        findings: {
            security: [SECURITY],
            architecture: [ARCH_TEST],
            simplification: [NIT],
        },
    })

/** Fix round 1 answered: the test-writer, then a fresh implementer. */
export const fixersAnswered = ({
    security,
}: {
    security: 'fixed' | 'wont_fix'
}): JournalEntry[] => [
    finalReviewFixing({ round: 1 }),
    testsWritten({
        ticket: null,
        finding_responses: [
            { finding_id: 'architecture-A1', response: 'fixed', reason: '' },
        ],
    }),
    implemented({
        ticket: null,
        finding_responses: [
            {
                finding_id: 'security-S1',
                response: security,
                reason: security === 'fixed' ? '' : 'Inputs are typed numbers.',
            },
        ],
    }),
]

/** The fixes pass the gates, are committed as `sha`, and pushed. */
export const fixesLanded = ({ sha }: { sha: string }): JournalEntry[] => [
    gatesRun({ ticket: null, target: 'run_branch', ok: true }),
    leftoverScan({ ticket: null, stage: 'fix' }),
    commitMade({ ticket: null, stage: 'fix', sha, files: ['src/sum.ts'] }),
    pushed({ ticket: null, sha }),
]

/** A whole fix round of the security finding, up to its push. */
export const securityFixRound = ({
    round,
}: {
    round: number
}): JournalEntry[] => [
    finalReviewFixing({ round }),
    implemented({
        ticket: null,
        session_id: `impl-${round}`,
        finding_responses: [
            { finding_id: 'security-S1', response: 'fixed', reason: '' },
        ],
    }),
    ...fixesLanded({ sha: `fix-${round}` }),
]
