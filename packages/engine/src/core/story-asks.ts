/**
 * What a run's story-writer is told of the run itself (#745): the run's
 * asks (its spec and the tickets it built, from the intake snapshot) and
 * what the run was unsure about (the PR body's open findings and
 * assumptions). Pure.
 */
import { assumptionLines, openFindingsLines } from './pull-request-text'

import type { SpecSnapshot, TicketSnapshot } from '../intake/intake-schemas'
import type { RunState } from '../journal/replay'

/** The run's spec and the tickets it built, in the run's ticket order. */
export type RunAsks = { spec: SpecSnapshot; tickets: TicketSnapshot[] }

/** The section's text when nothing was left open. */
export const NOTHING_LEFT_OPEN = 'Nothing was left open.'

const TILDES = '~~~~~~'

/**
 * The run's asks: its spec, and each ticket it built (one neither skipped
 * nor closed as already done), as last snapshotted.
 */
export const runAsks = ({ state }: { state: RunState }): RunAsks => {
    const { snapshot } = state
    if (snapshot === null) throw new Error('The run has no snapshot.')
    const tickets = snapshot.ticket_order.flatMap((number) => {
        const progress = state.tickets[number]
        const ticket = snapshot.tickets[number]
        if (ticket === undefined) return []
        if ((progress?.skipped ?? null) !== null) return []
        if ((progress?.already_done ?? null) !== null) return []
        return [ticket]
    })
    return { spec: snapshot.spec, tickets }
}

/**
 * The body of the `## The run's asks` section: the spec's line, URL and
 * body between lines of six tildes, then each built ticket's line, URL and
 * criteria, a blank line between blocks.
 */
export const asksBody = ({ spec, tickets }: RunAsks): string =>
    [
        [
            `Spec #${spec.number}: ${spec.title}`,
            spec.url,
            TILDES,
            spec.body,
            TILDES,
        ].join('\n'),
        ...tickets.map(({ number, title, url, criteria }) =>
            [
                `Ticket #${number}: ${title}`,
                url,
                ...criteria.map(({ id, text }) => `${id}: ${text}`),
            ].join('\n')
        ),
    ].join('\n\n')

/** The open findings and the assumptions, as the PR body lists them. */
export type RunUnsure = { open_findings: string[]; assumptions: string[] }

/** What the run was unsure about, from the state the PR body was made from. */
export const runUnsure = ({ state }: { state: RunState }): RunUnsure => {
    const { snapshot, tickets, final_review } = state
    if (snapshot === null) throw new Error('The run has no snapshot.')
    return {
        open_findings: openFindingsLines({ final_review }),
        assumptions: assumptionLines({ snapshot, tickets, final_review }),
    }
}

/** Whether the run left nothing open. */
export const nothingLeftOpen = ({
    open_findings,
    assumptions,
}: RunUnsure): boolean => open_findings.length === 0 && assumptions.length === 0

/**
 * The body of the `## What the run was unsure about` section: its open
 * findings and its assumptions, each part left out with no lines, or
 * `Nothing was left open.`
 */
export const unsureBody = (unsure: RunUnsure): string =>
    nothingLeftOpen(unsure)
        ? NOTHING_LEFT_OPEN
        : [
              ...(unsure.open_findings.length === 0
                  ? []
                  : [['Open findings:', ...unsure.open_findings].join('\n')]),
              ...(unsure.assumptions.length === 0
                  ? []
                  : [
                        [
                            'Assumptions agents made:',
                            ...unsure.assumptions,
                        ].join('\n'),
                    ]),
          ].join('\n\n')
