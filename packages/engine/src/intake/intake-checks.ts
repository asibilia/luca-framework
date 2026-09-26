import groupBy from 'lodash/groupBy'
import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'

import type {
    IntakeOutcome,
    IntakeProblem,
    IntakeRead,
    TicketSnapshot,
} from './intake-schemas'

import {
    ENGINE_CONFIG_FILE,
    testCommands,
    type EngineConfig,
} from '../config/engine-config'
import {
    READY_LABEL,
    REFACTOR_LABEL,
    type TrackerIssue,
} from '../tracker/tracker'

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/

/**
 * The text under a markdown heading, up to the next heading of the same or a
 * higher level. Matching is case-insensitive. Empty when the heading is absent.
 *
 * @example
 * section({ body: '## What to build\n\nA slice.', heading: 'What to build' })
 * // 'A slice.'
 */
export const section = ({
    body,
    heading,
}: {
    body: string
    heading: string
}): string => {
    const lines = body.split('\n')
    const wanted = heading.trim().toLowerCase()
    const start = lines.findIndex(
        (line) => HEADING.exec(line.trim())?.[2]?.toLowerCase() === wanted
    )
    if (start === -1) return ''
    const level = HEADING.exec(lines[start]?.trim() ?? '')?.[1]?.length ?? 2
    const rest = lines.slice(start + 1)
    const end = rest.findIndex((line) => {
        const depth = HEADING.exec(line.trim())?.[1]?.length
        return depth !== undefined && depth <= level
    })
    return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}

/** The text of every markdown checkbox (`- [ ] ...` or `- [x] ...`). */
export const checkboxes = ({ text }: { text: string }): string[] =>
    text
        .split('\n')
        .map((line) => /^\s*[-*+]\s+\[[ xX]\]\s+(.+)$/.exec(line)?.[1]?.trim())
        .filter((item): item is string => item !== undefined && item !== '')

/** Issue numbers written as `#N` in a ticket's "Blocked by" section. */
export const blockedBySectionRefs = ({ body }: { body: string }): number[] =>
    uniq(
        [...section({ body, heading: 'Blocked by' }).matchAll(/#(\d+)/g)].map(
            (match) => Number(match[1])
        )
    )

/** Every issue a ticket names as a blocker: native links and the section. */
export const blockerNumbers = ({ issue }: { issue: TrackerIssue }): number[] =>
    sortBy(uniq([...issue.blocked_by, ...blockedBySectionRefs(issue)]))

/**
 * Blocker numbers named by open tickets that are not sub-tickets of the spec,
 * so the engine knows which other issues to read before checking intake.
 */
export const outsideBlockerNumbers = ({
    sub_tickets,
}: {
    sub_tickets: TrackerIssue[]
}): number[] => {
    const inSpec = new Set(sub_tickets.map((ticket) => ticket.number))
    return sortBy(
        uniq(
            sub_tickets
                .filter((ticket) => ticket.state === 'open')
                .flatMap((issue) => blockerNumbers({ issue }))
                .filter((number) => !inSpec.has(number))
        )
    )
}

type Finding = { ticket: number | null; message: string }

/**
 * Walks blockers depth-first, blockers before the tickets they block. Returns
 * that order and every loop found, as a path such as `[12, 13, 12]`.
 */
const blockerOrder = ({
    edges,
}: {
    edges: Map<number, number[]>
}): { order: number[]; loops: number[][] } => {
    const visiting: number[] = []
    const done = new Set<number>()
    const order: number[] = []
    const loops: number[][] = []
    const visit = (number: number): void => {
        if (done.has(number)) return
        const at = visiting.indexOf(number)
        if (at !== -1) {
            loops.push([...visiting.slice(at), number])
            return
        }
        visiting.push(number)
        for (const blocker of edges.get(number) ?? []) visit(blocker)
        visiting.pop()
        done.add(number)
        order.push(number)
    }
    for (const number of sortBy([...edges.keys()])) visit(number)
    return { order, loops }
}

const groupFindings = ({
    findings,
}: {
    findings: Finding[]
}): IntakeProblem[] => {
    const grouped = groupBy(findings, (finding) => String(finding.ticket))
    const tickets = sortBy(
        uniq(findings.map((finding) => finding.ticket)),
        (ticket) => ticket ?? 0
    )
    return tickets.map((ticket) => ({
        ticket,
        missing: uniq(
            (grouped[String(ticket)] ?? []).map((finding) => finding.message)
        ),
    }))
}

/**
 * Intake's checks: is the spec, and every open ticket in it, ready to build?
 *
 * Pure. Every miss refuses the whole run, and every problem is collected (not
 * just the first), grouped by the spec or ticket it is on. Config and spec
 * problems refuse even an empty spec; otherwise a spec with no open tickets
 * has nothing to do. When everything passes, the result is the snapshot the
 * run builds from, with tickets in blocker order.
 */
export const checkIntake = ({
    config,
    intake_read,
}: {
    config: EngineConfig
    intake_read: IntakeRead
}): IntakeOutcome => {
    const { spec, sub_tickets, outside_blockers } = intake_read
    const findings: Finding[] = []
    const onSpec = (message: string) =>
        findings.push({ ticket: spec.number, message })

    const tests = testCommands({ config })
    if (tests.length === 0) {
        findings.push({
            ticket: null,
            message: `The engine config (${ENGINE_CONFIG_FILE}) has no test command at checks.test.`,
        })
    } else if (
        !tests.some(({ results }) => results === 'bun') &&
        sub_tickets.some(
            (ticket) =>
                ticket.state === 'open' &&
                !ticket.labels.includes(REFACTOR_LABEL)
        )
    ) {
        // The red check reads per-test results, which only bun's give today.
        findings.push({
            ticket: null,
            message: `The engine config (${ENGINE_CONFIG_FILE}) has no test command with bun results at checks.test, so the red check can't prove new tests fail first. Add a \`bun test\` command, or label every open ticket \`${REFACTOR_LABEL}\`.`,
        })
    }
    if (spec.state !== 'open') onSpec('The spec is closed.')
    if (section({ body: spec.body, heading: 'Testing Decisions' }) === '') {
        onSpec('The spec has no "Testing Decisions" section, or it is empty.')
    }

    const open = sortBy(
        sub_tickets.filter((ticket) => ticket.state === 'open'),
        'number'
    )
    const closedTickets = sortBy(
        sub_tickets
            .filter((ticket) => ticket.state === 'closed')
            .map((ticket) => ticket.number)
    )
    const openNumbers = new Set(open.map((ticket) => ticket.number))
    const inSpec = new Set(sub_tickets.map((ticket) => ticket.number))
    const outside = new Map(
        outside_blockers.map((issue) => [issue.number, issue])
    )

    const tickets: TicketSnapshot[] = open.map((ticket) => {
        const onTicket = (message: string) =>
            findings.push({ ticket: ticket.number, message })
        if (section({ body: ticket.body, heading: 'What to build' }) === '') {
            onTicket(
                'The ticket has no "What to build" section, or it is empty.'
            )
        }
        const criteria = checkboxes({
            text: section({
                body: ticket.body,
                heading: 'Acceptance criteria',
            }),
        }).map((text, index) => ({ id: `AC${index + 1}`, text }))
        if (criteria.length === 0) {
            onTicket('The ticket has no checkbox under "Acceptance criteria".')
        }
        if (!ticket.labels.includes(READY_LABEL)) {
            onTicket(`The ticket does not have the ${READY_LABEL} label.`)
        }
        const blockers = blockerNumbers({ issue: ticket })
        for (const blocker of blockers.filter((n) => !inSpec.has(n))) {
            const issue = outside.get(blocker)
            if (issue === undefined) {
                onTicket(
                    `The ticket is blocked by #${blocker}, which could not be found.`
                )
            } else if (issue.state === 'open') {
                onTicket(
                    `The ticket is blocked by #${blocker}, which is still open and is not part of spec #${spec.number}.`
                )
            }
        }
        return {
            number: ticket.number,
            title: ticket.title,
            body: ticket.body,
            labels: ticket.labels,
            url: ticket.url,
            criteria,
            blockers: blockers.filter((n) => openNumbers.has(n)),
        }
    })

    const { order, loops } = blockerOrder({
        edges: new Map(
            tickets.map((ticket) => [ticket.number, ticket.blockers])
        ),
    })
    for (const loop of loops) {
        const path = loop.map((number) => `#${number}`).join(' -> ')
        for (const ticket of uniq(loop)) {
            findings.push({
                ticket,
                message: `The ticket's blockers form a loop: ${path}.`,
            })
        }
    }

    if (findings.length > 0) {
        return { outcome: 'refused', problems: groupFindings({ findings }) }
    }
    if (tickets.length === 0) {
        return { outcome: 'nothing_to_do', closed_tickets: closedTickets }
    }
    const byNumber = new Map(tickets.map((ticket) => [ticket.number, ticket]))
    return {
        outcome: 'passed',
        snapshot: {
            spec: {
                number: spec.number,
                title: spec.title,
                body: spec.body,
                labels: spec.labels,
                url: spec.url,
                author: spec.author,
            },
            tickets: order.flatMap((number) => byNumber.get(number) ?? []),
            closed_tickets: closedTickets,
        },
    }
}
