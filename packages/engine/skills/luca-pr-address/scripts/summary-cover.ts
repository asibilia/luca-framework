/**
 * Which findings a summary comment answers, for the `/luca-pr-address`
 * skill. A review's own text and an alert have no thread, so the summary
 * comment is their only answer. A summary answers exactly the findings it
 * lists in its hidden `covers` block, never "everything older than me":
 * a comment that arrives while a run is working is not answered by a
 * summary that never read it.
 *
 * A summary starts with two hidden parts:
 *
 *   <!-- luca-pr-address summary iteration=1 head=<full head sha> -->
 *   <!-- luca-pr-address covers
 *   rv-5846885354
 *   rc-4528617360
 *   -->
 *
 * Pure: it reads no file and calls nothing.
 */
import { SUMMARY_MARKER, type Finding } from './pr-findings'

/** The hidden line that opens a summary's list of the findings it answers. */
export const COVERS_MARKER = '<!-- luca-pr-address covers'

/** One summary this skill posted on the PR. */
export type PostedSummary = {
    at: string
    /** The head commit it was written for, from its first line. */
    head_sha: string
    /** The finding ids it answers; `null` for a summary from before the covers block. */
    covers: string[] | null
}

/** What the PR's summaries answer, taken together. */
export type SummaryCover = {
    /** Every finding id some summary lists. */
    ids: Set<string>
    /** When the last summary without a covers block was posted, or `''`. */
    legacy_at: string
    /** The head commits of the summaries without a covers block. */
    legacy_heads: Set<string>
    /** When the last summary of any kind was posted, or `''`. */
    last_at: string
}

const text = (value: unknown): string =>
    typeof value === 'string' ? value : ''

/** The head commit a summary's first line names, or `''`. */
export const summaryHead = (body: string): string =>
    /^<!-- luca-pr-address summary[^>]*\bhead=([0-9a-f]+)/.exec(body)?.[1] ?? ''

/** The ids in a summary's covers block, or `null` when it has none. */
export const summaryCovers = (body: string): string[] | null => {
    const start = body.indexOf(COVERS_MARKER)
    if (start === -1) return null
    const end = body.indexOf('-->', start)
    if (end === -1) return null
    return body
        .slice(start + COVERS_MARKER.length, end)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
}

/**
 * The covers block for a summary: paste it right under the summary's
 * first line.
 *
 * @example
 * coversBlock(['rv-1', 'rc-2']) // '<!-- luca-pr-address covers\nrv-1\nrc-2\n-->'
 */
export const coversBlock = (ids: string[]): string =>
    [COVERS_MARKER, ...ids, '-->'].join('\n')

/** Every summary this skill posted on the PR, oldest first. */
export const postedSummaries = (
    issue_comments: Record<string, unknown>[]
): PostedSummary[] =>
    issue_comments
        .filter((comment) => text(comment.body).startsWith(SUMMARY_MARKER))
        .map((comment) => ({
            at: text(comment.created_at),
            head_sha: summaryHead(text(comment.body)),
            covers: summaryCovers(text(comment.body)),
        }))
        .toSorted((a, b) => a.at.localeCompare(b.at))

/**
 * What the summaries answer. A summary from before the covers block (it
 * has none) keeps the old rule, for that summary only: it answers every
 * review text submitted before it, and the alerts of its head commit.
 */
export const summaryCover = (summaries: PostedSummary[]): SummaryCover => {
    const legacy = summaries.filter(({ covers }) => covers === null)
    return {
        ids: new Set(summaries.flatMap(({ covers }) => covers ?? [])),
        legacy_at: legacy.at(-1)?.at ?? '',
        legacy_heads: new Set(legacy.map(({ head_sha }) => head_sha)),
        last_at: summaries.at(-1)?.at ?? '',
    }
}

/** A finding that is not answered yet, in the few fields a person needs. */
export type LateFinding = Pick<
    Finding,
    'id' | 'source' | 'author' | 'from_owner' | 'html_url'
>

/**
 * Checks a summary before it is posted, against a fetch made just now:
 *
 * - its first line is the summary marker, with the PR's full head sha;
 * - it has a covers block, and every id in it is a real finding;
 * - a covered line or file comment already has its thread reply;
 * - `late` lists every finding that is still unanswered and that the
 *   summary does not cover. Those arrived while the run was working, or
 *   were missed. Address them, or leave them out of the covers block so
 *   the next run sees them: never cover a finding you did not address.
 *
 * @example
 * const { ready, problems, late } = checkSummary({ summary, head_sha, findings })
 */
export const checkSummary = ({
    summary,
    head_sha,
    findings,
}: {
    summary: string
    head_sha: string
    findings: Finding[]
}): { ready: boolean; problems: string[]; late: LateFinding[] } => {
    const problems: string[] = []
    const first_line = summary.split('\n')[0] ?? ''
    const marker =
        /^<!-- luca-pr-address summary iteration=(\d+) head=([0-9a-f]+) -->$/.exec(
            first_line
        )
    if (marker === null) {
        problems.push(
            'The first line must be `<!-- luca-pr-address summary iteration=<k> head=<sha> -->`.'
        )
    } else if (marker[2] !== head_sha) {
        problems.push(
            `head= must be the PR's full head commit after the push, ${head_sha}; it is ${String(marker[2])}.`
        )
    }
    const covers = summaryCovers(summary)
    if (covers === null) {
        problems.push(
            'There is no covers block: list the id of every finding this summary answers.'
        )
    }
    const covered = new Set(covers ?? [])
    const by_id = new Map(findings.map((finding) => [finding.id, finding]))
    for (const id of covered) {
        const finding = by_id.get(id)
        if (finding === undefined) {
            problems.push(
                `The covers block names ${id}, which is not a finding.`
            )
        } else if (finding.source === 'review_comment' && !finding.has_reply) {
            problems.push(
                `${id} is covered but its thread has no reply yet: reply on the thread first.`
            )
        }
    }
    const late = findings
        .filter((finding) => !finding.has_reply && !covered.has(finding.id))
        .map(({ id, source, author, from_owner, html_url }) => ({
            id,
            source,
            author,
            from_owner,
            html_url,
        }))
    return { ready: problems.length === 0 && late.length === 0, problems, late }
}
