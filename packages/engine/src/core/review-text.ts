import uniq from 'lodash/uniq'

import type { Finding, FindingResponse } from '../agents/role-results'
import type {
    ReplayedGates,
    ReviewFix,
    TicketProgress,
} from '../journal/replay'
import { clipOutput } from '../shell/run-command'

const SEVERITY_TEXT: Record<Finding['severity'], string> = {
    blocker: 'blocker',
    should_fix: 'should-fix',
    nit: 'nit',
}

/** One finding as a list item, with its file and detail. */
export const findingLine = (finding: Finding): string => {
    const where = finding.file === null ? '' : ` (${finding.file})`
    const detail = finding.detail === '' ? '' : `\n  ${finding.detail}`
    return `- ${finding.id} [${SEVERITY_TEXT[finding.severity]}, ${finding.kind}]${where}: ${finding.title}${detail}`
}

const findingList = (findings: Finding[]): string =>
    findings.map(findingLine).join('\n')

/** Each gate's command and outcome, with a failed gate's (clipped) output. */
const gateResults = ({ gates }: { gates: ReplayedGates | null }): string => {
    if (gates === null) return 'The engine has no gate results for this ticket.'
    return gates.checks
        .map(({ name, command, ok, output }) => {
            const line = `- ${name} (\`${command}\`): ${ok ? 'passed' : 'FAILED'}`
            return ok || output === ''
                ? line
                : `${line}\n\n\`\`\`\n${clipOutput({ text: output, max: 2000 })}\n\`\`\``
        })
        .join('\n')
}

const fileList = (files: string[]): string =>
    files.length === 0
        ? '(no files changed)'
        : files.map((file) => `- ${file}`).join('\n')

const responseText = ({
    finding,
    responses,
}: {
    finding: Finding
    responses: FindingResponse[]
}): string => {
    const answer = responses.find(({ finding_id }) => finding_id === finding.id)
    if (answer === undefined) return '  Fixer: no answer.'
    return answer.response === 'fixed'
        ? `  Fixer: fixed. ${answer.reason}`.trimEnd()
        : `  Fixer: WON'T FIX. Reason: ${answer.reason || 'none given'}`
}

/**
 * The review part of a ticket reviewer's prompt: what to diff, the files it
 * touches, and the engine's gate results. A re-review sees only the new
 * changes since the last review, plus the earlier findings with each
 * fixer's answer, and rules on every "won't fix".
 *
 * @example
 * const sections = reviewSections({ progress, base_sha: worktree.base_sha })
 */
export const reviewSections = ({
    progress,
    base_sha,
}: {
    progress: TicketProgress
    base_sha: string
}): string[] => {
    const gates = `## Gate results\n\nThe engine ran the gates on this commit:\n\n${gateResults({ gates: progress.gates })}`
    const fix = progress.review_fix
    if (fix === null) {
        const head = progress.commits.green ?? 'HEAD'
        const files = uniq([
            ...progress.commit_files.red,
            ...progress.commit_files.green,
        ])
        return [
            `## The diff to review\n\nThe ticket's committed diff: \`git diff ${base_sha}..${head}\`.\n\nFiles it changes:\n${fileList(files)}`,
            gates,
        ]
    }
    const from = progress.reviewed_sha ?? base_sha
    const head = progress.commits.fix ?? 'HEAD'
    const earlier = fix.findings
        .map(
            (finding) =>
                `${findingLine(finding)}\n${responseText({ finding, responses: fix.responses })}`
        )
        .join('\n')
    return [
        `## This is re-review ${fix.round + 1}: review ONLY the new changes\n\n` +
            `The earlier review(s) covered everything up to ${from}. Look only at the fixes since: \`git diff ${from}..${head}\`. ` +
            'Do not raise new findings on code these changes did not touch.\n\n' +
            `Files the fixes change:\n${fileList(progress.commit_files.fix)}`,
        `## The earlier findings, with each fixer's answer\n\n${earlier}\n\n` +
            'For each earlier finding: if it is still not fixed, list it again in "findings" with the SAME id. ' +
            'For each "won\'t fix", add a ruling: "accepted" lets the finding go (it is listed in the PR as declined); ' +
            '"rejected" keeps it open, and then you must list it again in "findings". New findings get new ids.',
        gates,
    ]
}

const FIX_RULES =
    'For EACH finding, answer in "finding_responses": "fixed", or "wont_fix" with your reason if the finding is wrong. ' +
    'A fresh reviewer rules on every "won\'t fix", so give a reason that stands on its own. ' +
    'The engine runs the gates again and then a fresh reviewer checks your changes.'

/**
 * The findings a review fixer gets: the test findings for a fresh
 * test-writer, or the code findings for the implementer.
 *
 * @example
 * const section = reviewFixSection({ fix, kind: 'test' })
 */
export const reviewFixSection = ({
    fix,
    kind,
}: {
    fix: ReviewFix
    kind: Finding['kind']
}): string =>
    [
        `## Review fix round ${fix.round}: the ticket review's ${kind === 'test' ? 'test' : 'code'} findings`,
        kind === 'test'
            ? 'The code and tests are already committed. Fix these findings in the test files only. ' +
              'Your changed tests are not red-checked, but they must pass once the code is right.'
            : "Fix these findings in the code. Keep to your role's rules on test files.",
        findingList(fix.findings.filter((finding) => finding.kind === kind)),
        FIX_RULES,
    ].join('\n\n')

/**
 * The follow-up the implementer gets in its open session when a ticket
 * review asks for code changes. The engine journals it word for word.
 *
 * @example
 * const message = reviewFixMessage({ fix })
 */
export const reviewFixMessage = ({ fix }: { fix: ReviewFix }): string =>
    [
        'A fresh reviewer checked your committed work and asked for changes.',
        reviewFixSection({ fix, kind: 'code' }),
        'Answer again with your full result.',
    ].join('\n\n')

/** The findings still open at the review cap, for a stuck ticket's detail. */
export const openFindingsText = ({
    findings,
}: {
    findings: Finding[]
}): string => findingList(findings)
