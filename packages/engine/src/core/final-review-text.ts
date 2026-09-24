import { failedChecks } from './fix-loop-text'
import {
    fileList,
    findingLine,
    findingList,
    FIX_RULES,
    gateResults,
    responseText,
    RULING_RULES,
} from './review-text'

import {
    roleTask,
    runNotesSection,
    type PromptRunNote,
} from '../agents/role-prompts'
import { lensRole, type Finding, type LensName } from '../agents/role-results'
import type {
    FinalFinding,
    FinalReviewFix,
    FinalReviewState,
    ReplayedGates,
    ReplayedSnapshot,
    RuleFile,
} from '../journal/replay'

/**
 * The final review's texts: each lens's prompt (the whole run branch, or a
 * re-review of only the new changes), what each fixer is sent, and the open
 * findings for a stuck final review and its PR. Pure.
 */

const SEVERITY_TEXT: Record<Finding['severity'], string> = {
    blocker: 'blocker',
    should_fix: 'should-fix',
    nit: 'nit',
}

/** The spec and every ticket of the run, with each criterion's id. */
const workSections = ({
    snapshot,
}: {
    snapshot: ReplayedSnapshot
}): string[] => {
    const { spec, ticket_order, tickets } = snapshot
    const ticketTexts = ticket_order.flatMap((number) => {
        const ticket = tickets[number]
        if (ticket === undefined) return []
        return [
            [
                `### Ticket #${ticket.number}: ${ticket.title}`,
                ticket.body,
                'Acceptance criteria:',
                ticket.criteria
                    .map(({ id, text }) => `- ${id}: ${text}`)
                    .join('\n'),
            ].join('\n\n'),
        ]
    })
    return [
        `## Spec #${spec.number}: ${spec.title}`,
        spec.body,
        `## The tickets on the run branch`,
        ...ticketTexts,
    ]
}

/** The rules lens's section: each rule file word for word, or a note. */
const rulesSection = ({ rules }: { rules: RuleFile[] }): string => {
    if (rules.length === 0) {
        return (
            "## The repo's rule files\n\n" +
            'The engine config lists no rule files. Judge the branch against the rules the repo documents for itself (such as AGENTS.md or CLAUDE.md at its root, if they exist).'
        )
    }
    const files = rules.map(({ path, text }) =>
        text === null
            ? `### ${path}\n\nThe engine could not read this file. Don't guess what it says.`
            : `### ${path}\n\n${text}`
    )
    return [
        "## The repo's rule files",
        'The engine config lists these rule files. Here they are word for word:',
        ...files,
    ].join('\n\n')
}

const gatesSection = ({ gates }: { gates: ReplayedGates | null }): string =>
    `## Gate results\n\nThe engine ran the gates on the run branch:\n\n${gateResults({ gates })}`

/**
 * A re-review's sections for one lens: only the new changes, and that
 * lens's earlier findings with each fixer's answer and the ruling rules.
 */
const reReviewSections = ({
    lens,
    review,
    fix,
}: {
    lens: LensName
    review: FinalReviewState
    fix: FinalReviewFix
}): string[] => {
    const earlier = fix.findings
        .filter((finding) => finding.lens === lens)
        .map(
            (finding) =>
                `${findingLine(finding)}\n${responseText({ finding, responses: fix.responses })}`
        )
        .join('\n')
    return [
        `## This is re-review ${review.round} of the ${lens} lens: review ONLY the new changes\n\n` +
            `The earlier rounds covered the run branch up to ${review.from_sha}. Look only at the fixes since: \`git diff ${review.from_sha}..${review.head_sha}\`. ` +
            'Do not raise new findings on code these changes did not touch.\n\n' +
            `Files the fixes change:\n${fileList(review.files)}`,
        `## Your lens's earlier findings, with each fixer's answer\n\n${earlier}\n\n${RULING_RULES}`,
    ]
}

/**
 * The prompt a lens starts with: its task, the spec, every ticket, the
 * whole run branch's diff and files, and the latest gate results on the run
 * branch. The rules lens also gets each rule file's text. A re-review
 * (round 2 on) sees only the new changes, plus the lens's earlier findings
 * with each fixer's answer. The engine journals it word for word.
 *
 * @example
 * const prompt = lensPrompt({ lens: 'security', snapshot, review, gates })
 */
export const lensPrompt = ({
    lens,
    snapshot,
    review,
    gates,
    run_notes,
}: {
    lens: LensName
    snapshot: ReplayedSnapshot
    review: FinalReviewState
    /** The latest gates on the run branch. */
    gates: ReplayedGates | null
    /** Notes earlier agents in the run left, oldest first. */
    run_notes?: PromptRunNote[]
}): string => {
    const role = lensRole({ lens })
    const diff =
        review.fix === null
            ? [
                  `## The diff to review\n\nThe whole run branch, every ticket together: \`git diff ${review.from_sha}..${review.head_sha}\`.\n\n` +
                      `Files it changes:\n${fileList(review.files)}`,
              ]
            : reReviewSections({ lens, review, fix: review.fix })
    return [
        `# Your role: ${role}`,
        roleTask({ role }),
        ...workSections({ snapshot }),
        ...diff,
        ...(lens === 'rules' ? [rulesSection({ rules: review.rules })] : []),
        gatesSection({ gates }),
        ...runNotesSection({ run_notes: run_notes ?? [] }),
    ].join('\n\n')
}

const FIXER_TASKS = {
    'test-writer':
        "You are fixing the final review's test findings on the whole run branch. Edit test files only. " +
        'Your changed tests are not red-checked, but they must pass.',
    implementer:
        "You are fixing the final review's code findings on the whole run branch. Never edit a test file. " +
        'Make every gate pass. Never run the package install: when you change a package manifest, the engine runs the install.',
} as const

/** The fixer roles of the final review. */
export type FinalFixerRole = keyof typeof FIXER_TASKS

/** A fixer's findings of one kind, with how to answer them. */
const findingsSection = ({
    fix,
    kind,
}: {
    fix: FinalReviewFix
    kind: Finding['kind']
}): string =>
    [
        `## Final review fix round ${fix.round}: the lenses' ${kind} findings`,
        "Every ticket of the spec has joined the run branch, and a final review looked at the whole branch through five lenses. You are fixing the final review's findings on the whole run branch.",
        findingList(fix.findings.filter((finding) => finding.kind === kind)),
        FIX_RULES,
    ].join('\n\n')

/**
 * The prompt a fresh final review fixer starts with: its task, the spec,
 * every ticket, and its findings (the test findings for the test-writer,
 * the code findings for the implementer). An implementer launched only to
 * fix failed gates (the round had only test findings) gets the gates'
 * output instead. The engine journals it word for word.
 *
 * @example
 * const prompt = finalFixerPrompt({ role: 'implementer', snapshot, fix, gates: null })
 */
export const finalFixerPrompt = ({
    role,
    snapshot,
    fix,
    gates,
    run_notes,
    sections,
}: {
    role: FinalFixerRole
    snapshot: ReplayedSnapshot
    fix: FinalReviewFix
    /** Failed gates to fix, for an implementer with no findings left. */
    gates: ReplayedGates | null
    /** Notes earlier agents in the run left, oldest first. */
    run_notes?: PromptRunNote[]
    /** More sections after the task, such as a follow-up's message. */
    sections?: string[]
}): string => {
    const kind = role === 'test-writer' ? 'test' : 'code'
    const task =
        gates !== null && !gates.ok
            ? [
                  "## The gates failed after the final review's fixes",
                  "You are fixing the final review's findings on the whole run branch. The test fixes are in the worktree, uncommitted. The gates failed. Fix the code so every gate passes, then answer.",
                  failedChecks({ gates }),
              ].join('\n\n')
            : findingsSection({ fix, kind })
    return [
        `# Your role: ${role}`,
        FIXER_TASKS[role],
        ...workSections({ snapshot }),
        task,
        ...(sections ?? []),
        ...runNotesSection({ run_notes: run_notes ?? [] }),
    ].join('\n\n')
}

/**
 * The findings still open at the final review's round cap, for its stuck
 * detail.
 *
 * @example
 * openFinalFindingsText({ findings }) // '- security-S1 [should-fix, code] (src/sum.ts): ...'
 */
export const openFinalFindingsText = ({
    findings,
}: {
    findings: FinalFinding[]
}): string => findingList(findings)

/**
 * The "Open findings" section a shipped final review's PR starts with: why
 * it was stuck, and each finding still open with its lens, severity, and
 * file.
 *
 * @example
 * shippedFindingsSection({ findings, stuck })
 * // '## Open findings\n\n...\n\n- security lens, should-fix (src/sum.ts): security-S1 Sum trusts its input'
 */
export const shippedFindingsSection = ({
    findings,
    stuck,
}: {
    findings: FinalFinding[]
    stuck: { reason: string; detail: string }
}): string => {
    const lines = findings.map(
        ({ lens, severity, file, id, title }) =>
            `- ${lens} lens, ${SEVERITY_TEXT[severity]}${file === null ? '' : ` (${file})`}: ${id} ${title}`
    )
    return [
        '## Open findings',
        `The final review got stuck (\`${stuck.reason}\`) and you replied \`ship\`, so this PR opened with the final review unfinished.`,
        lines.length === 0
            ? `No lens finding was open. Why it was stuck:\n\n${stuck.detail}`
            : `These findings are still open:\n\n${lines.join('\n')}`,
    ].join('\n\n')
}
