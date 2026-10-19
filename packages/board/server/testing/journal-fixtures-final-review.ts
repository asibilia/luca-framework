/**
 * Journal records about the final review: its own kinds, and the lenses',
 * fixers', and gates' records as the engine journals them (#367).
 */
import { entry, RESULTS, type Entry } from './journal-fixture-base'
import {
    gatesRun,
    type Finding,
    type FindingResponse,
} from './journal-fixtures-tickets'

export const finalReviewStarted = (): Entry =>
    entry({ kind: 'final_review_started', content: {} })

export const lensStarted = ({ lens }: { lens: string }): Entry =>
    entry({ kind: 'lens_started', content: { lens } })

export const lensFinished = ({
    lens,
    findings,
}: {
    lens: string
    findings: { blocker: number; should_fix: number; nit: number }
}): Entry => entry({ kind: 'lens_finished', content: { lens, findings } })

export const finalReviewFixing = ({ round }: { round: number }): Entry =>
    entry({ kind: 'final_review_fixing', content: { round } })

export const finalReviewStuck = ({
    reason,
    detail,
}: {
    reason: string
    detail: string
}): Entry => entry({ kind: 'final_review_stuck', content: { reason, detail } })

export const finalReviewPassed = (): Entry =>
    entry({ kind: 'final_review_passed', content: {} })

// The final review as the engine journals it (#367): its own kinds with
// the engine's extra fields, and the usual agent, gate, scan, commit, and
// push kinds with `ticket: null`.

const LENSES = [
    'architecture',
    'simplification',
    'security',
    'integration',
    'rules',
]

/** `final_review_started` with every field the engine writes. */
export const engineFinalReviewStarted = ({
    round,
    lenses = LENSES,
}: {
    round: number
    lenses?: string[]
}): Entry =>
    entry({
        kind: 'final_review_started',
        content: {
            round,
            from_sha: round === 1 ? 'base' : `fix-${round - 1}`,
            head_sha: round === 1 ? 'g1' : `fix-${round - 1}`,
            lenses,
            files: ['src/export.ts'],
            rules: [{ path: 'AGENTS.md', text: '# Rules' }],
        },
    })

/**
 * One lens's turn as the engine journals it: `lens_started`, its agent's
 * start and finish (role `<lens>-lens`, no ticket), and `lens_finished`.
 */
export const engineLensTurn = ({
    lens,
    round,
    findings = [],
}: {
    lens: string
    round: number
    findings?: Finding[]
}): Entry[] => {
    const role = `${lens}-lens`
    const count = (severity: Finding['severity']) =>
        findings.filter((each) => each.severity === severity).length
    return [
        entry({ kind: 'lens_started', content: { lens, round } }),
        entry({
            kind: 'agent_started',
            role,
            content: {
                role,
                prompt: `You are the ${role}.`,
                follow_up_of: null,
            },
        }),
        entry({
            kind: 'agent_finished',
            role,
            content: {
                role,
                session_id: `session-${role}-${round}`,
                result: {
                    verdict: findings.some((each) => each.severity !== 'nit')
                        ? 'changes_requested'
                        : 'approve',
                    findings,
                    rulings: [],
                    summary: '',
                    assumptions: [],
                },
            },
        }),
        entry({
            kind: 'lens_finished',
            content: {
                lens,
                round,
                findings: {
                    blocker: count('blocker'),
                    should_fix: count('should_fix'),
                    nit: count('nit'),
                },
            },
        }),
    ]
}

/** A final review fixer's turn (no ticket), answering these findings. */
export const engineFinalFixerTurn = ({
    role,
    responses,
}: {
    role: 'test-writer' | 'implementer'
    responses: FindingResponse[]
}): Entry[] => [
    entry({
        kind: 'agent_started',
        role,
        content: { role, prompt: 'Fix the findings.', follow_up_of: null },
    }),
    entry({
        kind: 'agent_finished',
        role,
        content: {
            role,
            session_id: `session-${role}-final`,
            result: {
                ...(RESULTS[role] as Record<string, unknown>),
                finding_responses: responses,
            },
        },
    }),
]

/** The final review's fixes: gates on the run branch, the commit, the push. */
export const engineFinalFixesLanded = ({
    round,
    gates_ok = true,
}: {
    round: number
    gates_ok?: boolean
}): Entry[] => [
    {
        ...gatesRun({ ticket: 0, ok: gates_ok, target: 'run_branch' }),
        ticket: null,
    },
    entry({ kind: 'leftover_scan', content: { stage: 'fix', hits: [] } }),
    entry({
        kind: 'commit_made',
        content: {
            stage: 'fix',
            sha: `fix-${round}`,
            message: `fix: final review round ${round} for spec #10`,
            files: ['src/export.ts'],
        },
    }),
    entry({
        kind: 'run_branch_pushed',
        content: { branch: 'luca/run-10', sha: `fix-${round}` },
    }),
]

export const finalReviewShipped = (): Entry =>
    entry({ kind: 'final_review_shipped', content: {} })
