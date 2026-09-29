import compact from 'lodash/compact'
import flatMap from 'lodash/flatMap'
import uniq from 'lodash/uniq'

import { alreadyDoneNote } from './already-done'
import { shippedFindingsSection } from './final-review-text'
import { leftOutSections } from './left-out'
import { newMemoriesSection } from './memory-text'
import { reasonLine } from './stuck-text'

import {
    EMPTY_FINAL_REVIEW,
    type FinalReviewState,
    type ReplayedSnapshot,
    type TicketProgress,
} from '../journal/replay'
import type { MemorySave } from '../memory/memory-schemas'

const SEVERITY_TEXT = {
    blocker: 'blocker',
    should_fix: 'should-fix',
    nit: 'nit',
} as const

const fileText = (file: string | null): string =>
    file === null ? '' : ` (${file})`

/**
 * The run's pull request title and body, from the snapshot, each ticket's
 * progress, and the final review: which tickets it closes (an already-done
 * one with the commits that did its work, #484), the tickets left for a
 * person and the ones waiting on them (#499), the tickets left
 * out (skipped, and why), the assumptions agents made (from every round of
 * every agent on each ticket, and in the final review), the reviews' nits,
 * the findings declined through "won't fix", and the memories the learner
 * added or updated (#370). A final review shipped
 * while stuck puts its open findings at the very top.
 *
 * @example
 * const { title, body } = pullRequestText({ snapshot, tickets, final_review })
 */
export const pullRequestText = ({
    snapshot,
    tickets,
    final_review,
    memory_saves,
}: {
    snapshot: ReplayedSnapshot
    tickets: Record<number, TicketProgress>
    /** Defaults to a final review that never ran. */
    final_review?: FinalReviewState
    /** The learner's saves (#370); the added and updated are listed. */
    memory_saves?: MemorySave[]
}): { title: string; body: string } => {
    const review = final_review ?? EMPTY_FINAL_REVIEW
    const { spec } = snapshot
    const title = (number: number) => snapshot.tickets[number]?.title ?? ''
    const isSkipped = (number: number) =>
        (tickets[number]?.skipped ?? null) !== null
    const ticket_order = snapshot.ticket_order.filter(
        (number) => !isSkipped(number)
    )
    // A ticket whose work was already done is closed too, with its commits.
    const closes = ticket_order.map((number) => {
        const done = tickets[number]?.already_done ?? null
        const note = done === null ? '' : alreadyDoneNote({ shas: done.shas })
        return `- Closes #${number}: ${title(number)}${note}`
    })
    const skipped = snapshot.ticket_order.flatMap((number) => {
        const progress = tickets[number]
        if (progress === undefined || progress.skipped === null) return []
        const { because } = progress.skipped
        const why =
            because !== null
                ? `waits on #${because}`
                : `stuck (${progress.stuck === null ? 'no reason recorded' : reasonLine({ reason: progress.stuck.reason })}), skipped by reply`
        return [`- #${number} ${title(number)}: ${why}`]
    })
    const assumptions = flatMap(ticket_order, (number) =>
        uniq(tickets[number]?.assumptions ?? []).map(
            (text) => `- #${number}: ${text}`
        )
    )
    const finalAssumptions = uniq(review.assumptions).map(
        (text) => `- final review: ${text}`
    )
    const nits = [
        ...flatMap(ticket_order, (number) =>
            (tickets[number]?.nits ?? []).map(
                ({ id, title, file }) =>
                    `- #${number} ${id}${fileText(file)}: ${title}`
            )
        ),
        ...review.nits.map(
            ({ lens, id, title, file }) =>
                `- final review, ${lens} lens: ${id}${fileText(file)}: ${title}`
        ),
    ]
    const declinedLine = ({
        where,
        finding,
        reason,
        ruling,
    }: {
        /** What the finding's id follows: its ticket, or its lens. */
        where: string
        finding: {
            id: string
            severity: keyof typeof SEVERITY_TEXT
            file: string | null
            title: string
        }
        reason: string
        ruling: string
    }): string =>
        `- ${where}${finding.id} (${SEVERITY_TEXT[finding.severity]})${fileText(finding.file)}: ${finding.title}\n` +
        `  Won't fix: ${reason || 'no reason given'}` +
        (ruling === '' ? '' : `\n  Reviewer: ${ruling}`)
    const declined = [
        ...flatMap(ticket_order, (number) =>
            (tickets[number]?.declined ?? []).map((entry) =>
                declinedLine({ where: `#${number} `, ...entry })
            )
        ),
        ...review.declined.map((entry) =>
            declinedLine({
                where: `final review, ${entry.lens} lens: `,
                ...entry,
            })
        ),
    ]
    const shipped =
        review.shipped && review.stuck !== null
            ? shippedFindingsSection({
                  findings: review.fix?.findings ?? [],
                  stuck: review.stuck,
                  edits: review.shipped_edits,
              })
            : ''
    const body = [
        shipped,
        `Built by the Luca engine from spec #${spec.number}.`,
        `## Tickets\n\n${closes.join('\n')}`,
        ...leftOutSections({ left_out: snapshot.left_out }),
        skipped.length === 0
            ? ''
            : `## Skipped tickets\n\nLeft out of this run. They stay open for a later run.\n\n${skipped.join('\n')}`,
        assumptions.length + finalAssumptions.length === 0
            ? ''
            : `## Assumptions\n\nCalls agents made by themselves. Please check them.\n\n${[...assumptions, ...finalAssumptions].join('\n')}`,
        nits.length === 0
            ? ''
            : `## Nits\n\nSmall things the ticket reviews and the final review noted but did not send back.\n\n${nits.join('\n')}`,
        declined.length === 0
            ? ''
            : `## Declined findings\n\nFindings a fixer answered "won't fix", and a fresh reviewer let go.\n\n${declined.join('\n')}`,
        newMemoriesSection({ saves: memory_saves ?? [] }),
    ]
    return {
        title: `${spec.title} (#${spec.number})`,
        body: compact(body).join('\n\n'),
    }
}

/**
 * What the engine keeps the PR body, and each of its PR comments, under
 * (#508): a margin below GitHub's limit of 65,536 characters.
 */
export const PULL_REQUEST_BUDGET = 60_000

/** The file in the run folder the PR's full text is saved to first (#508). */
export const PULL_REQUEST_FILE = 'pull-request.md'

/**
 * The body's long parts, which move into PR comments when the body is over
 * its budget. The rest (open findings, the tickets it closes, and the ones
 * left out) always stays in the body.
 */
const MOVABLE_HEADINGS = [
    '## Assumptions',
    '## Nits',
    '## Declined findings',
    '## New memories',
]

const CLIPPED = `\n\n… (clipped: the full text is in the run folder's \`${PULL_REQUEST_FILE}\`)`

/** Room kept in each comment for its heading and the engine's marker. */
const COMMENT_ROOM = 200

/** `text`, clipped to stay under `limit` characters. */
const clip = ({ text, limit }: { text: string; limit: number }): string =>
    text.length < limit
        ? text
        : `${text.slice(0, limit - CLIPPED.length - 1)}${CLIPPED}`

const isMovable = (section: string): boolean =>
    MOVABLE_HEADINGS.some(
        (heading) => section === heading || section.startsWith(`${heading}\n`)
    )

/**
 * A section cut into pieces under `limit`, between its list items; each
 * piece after the first repeats its heading. An item over the limit alone
 * is clipped.
 */
const sectionPieces = ({
    section,
    limit,
}: {
    section: string
    limit: number
}): string[] => {
    if (section.length < limit) return [section]
    const heading = section.split('\n', 1)[0] ?? ''
    const pieces: string[] = []
    let current = ''
    for (const item of section.split(/\n(?=- )/)) {
        const joined = current === '' ? item : `${current}\n${item}`
        if (joined.length < limit) {
            current = joined
            continue
        }
        if (current !== '') pieces.push(current)
        current = clip({ text: `${heading} (continued)\n\n${item}`, limit })
    }
    return current === '' ? pieces : [...pieces, current]
}

/** Pieces packed into as few texts under `limit` as they fit in. */
const packed = ({
    pieces,
    limit,
}: {
    pieces: string[]
    limit: number
}): string[] =>
    pieces.reduce<string[]>((texts, piece) => {
        const last = texts.at(-1)
        if (last !== undefined && `${last}\n\n${piece}`.length < limit) {
            return [...texts.slice(0, -1), `${last}\n\n${piece}`]
        }
        return [...texts, piece]
    }, [])

/**
 * The PR body as sent to GitHub, and the PR comments posted after it, from
 * its full text (#508). A body under `budget` goes as it is. A longer one
 * keeps its essentials (open findings, the tickets it closes, and the
 * tickets left out), and its long parts (assumptions, nits, declined
 * findings, new memories) as long as they fit; the rest moves into PR
 * comments, each under the budget, cut between list items, and the body
 * says so. Whatever is still too long is clipped, pointing at the full
 * text in the run folder.
 *
 * @example
 * fitPullRequestBody({ body: full })
 * // { body: '...## More in the PR comments\n\n...', comments: ['## Assumptions\n\n...'] }
 */
export const fitPullRequestBody = ({
    body,
    budget = PULL_REQUEST_BUDGET,
}: {
    body: string
    budget?: number
}): { body: string; comments: string[] } => {
    if (body.length < budget) return { body, comments: [] }
    const note = (moved: string[]) =>
        `## More in the PR comments\n\nThis PR's text is too long for its body, so its ${moved.map((section) => section.split('\n', 1)[0]?.replace('## ', '').toLowerCase()).join(', ')} are in the PR comments below. The full text is in the run folder's \`${PULL_REQUEST_FILE}\`.`
    const kept: string[] = []
    const moved: string[] = []
    for (const section of body.split(/\n\n(?=## )/)) {
        if (!isMovable(section)) {
            kept.push(section)
            continue
        }
        const fits =
            moved.length === 0 &&
            [...kept, section, note([section])].join('\n\n').length < budget
        if (fits) kept.push(section)
        else moved.push(section)
    }
    const comments = packed({
        pieces: moved.flatMap((section) =>
            sectionPieces({ section, limit: budget - COMMENT_ROOM })
        ),
        limit: budget - COMMENT_ROOM,
    })
    return {
        body: clip({
            text: [...kept, ...(moved.length === 0 ? [] : [note(moved)])].join(
                '\n\n'
            ),
            limit: budget,
        }),
        comments: comments.map((text, index) =>
            comments.length === 1
                ? text
                : `**More of this PR's notes (${index + 1} of ${comments.length})**\n\n${text}`
        ),
    }
}

/** One open ticket of the spec, as the tracker lists it. */
type OpenTicket = { number: number; title: string }

const TICKETS_HEADING = '## Tickets'

/**
 * The PR body with a "Not in this run" section right after its tickets
 * (#484): the spec's open tickets the run didn't build, such as one
 * reopened while the run went, or one that was closed at intake and
 * reopened since. The PR doesn't close them, so they are no surprise
 * later. With none, the body as it is.
 *
 * @example
 * withNotInRun({ body, open: [{ number: 13, title: 'Add the menu item' }] })
 * // '...## Tickets\n\n- Closes #11: Add sum\n\n## Not in this run\n\n...\n\n- #13 Add the menu item...'
 */
export const withNotInRun = ({
    body,
    open,
}: {
    body: string
    open: OpenTicket[]
}): string => {
    if (open.length === 0) return body
    const section =
        "## Not in this run\n\nOpen tickets of the spec that this run didn't build. This PR doesn't close them.\n\n" +
        open.map(({ number, title }) => `- #${number} ${title}`).join('\n')
    const tickets = body.indexOf(TICKETS_HEADING)
    const next =
        tickets === -1
            ? -1
            : body.indexOf('\n\n## ', tickets + TICKETS_HEADING.length)
    if (next === -1) return `${body}\n\n${section}`
    return `${body.slice(0, next)}\n\n${section}${body.slice(next)}`
}
