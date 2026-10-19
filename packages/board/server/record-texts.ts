import type { BoardRecord } from './board-vocabulary'
import {
    clip,
    countFindings,
    numbersText,
    reviewCountsText,
    startKind,
} from './reduce-board'

import type { Tone } from '../shared/board-rows'
import { LOOP_CAP, type BoardState } from '../shared/board-state'

/**
 * The words for single records that need more than a line: an agent's start
 * and finish (a ticket's, the final review's, the learner's), a message, a
 * memory search or save, and why a reply was ignored. Pure.
 */

/** What a commit's `stage` committed, in words. */
export const COMMITTED: Record<string, string> = {
    red: 'tests',
    green: 'code',
    fix: 'review fixes',
}

export const on = ({ ticket }: { ticket: number | null }): string =>
    ticket === null ? '' : `#${ticket}: `

export const event = ({ text, tone }: { text: string; tone: Tone }) => ({
    text,
    tone,
})

export const lowerFirst = ({ text }: { text: string }): string =>
    text.replace(/^./, (first) => first.toLowerCase())

/** Why the engine couldn't use a reply (`reply_ignored`'s `reason`), in words. */
export const ignoredText = ({
    reason,
    before,
}: {
    reason: string
    before: BoardState
}): string => {
    switch (reason) {
        case 'no_ticket_named': {
            const stuck = before.needs_you.find((item) => item.ticket !== null)
            return `name the ticket, like \`retry #${stuck?.ticket ?? 'n'}\``
        }
        case 'not_stuck':
            return "the ticket it names isn't stuck"
        case 'nothing_stuck':
            return 'nothing is stuck right now'
        case 'ship_needs_final_review':
            return '`ship` is only for a stuck final review'
        default:
            return reason.replaceAll('_', ' ')
    }
}

/**
 * Why a run ended with nothing to do: its tickets were already done (#484),
 * or what is open is for a person or waits on one (#499), or the spec has
 * no open tickets.
 */
export const nothingToDoText = ({
    content,
}: {
    content: Extract<BoardRecord, { kind: 'nothing_to_do' }>['content']
}): string => {
    const numbersOf = (reason: 'for_a_person' | 'waits_on_person') =>
        content.left_out
            .filter((ticket) => ticket.reason === reason)
            .map(({ number }) => number)
    const people = numbersOf('for_a_person')
    const waiting = numbersOf('waits_on_person')
    const done = content.already_done
    const parts = [
        done.length === 0
            ? ''
            : `the work of ${done.map((number) => `#${number}`).join(', ')} was already on the base branch`,
        people.length === 0
            ? ''
            : `${numbersText({ numbers: people })} ${people.length === 1 ? 'is' : 'are'} for a person`,
        waiting.length === 0
            ? ''
            : `${numbersText({ numbers: waiting })} ${waiting.length === 1 ? 'waits' : 'wait'} on a ticket for a person`,
    ].filter((part) => part !== '')
    if (parts.length === 0)
        return 'Nothing to do: the spec has no open tickets.'
    const last = parts.at(-1) ?? ''
    const text =
        parts.length === 1
            ? last
            : `${parts.slice(0, -1).join(', ')}, and ${last}`
    return `Nothing to do: ${text}.`
}

/** Longest message line shown in a row; the whole message is in the journal. */
const MESSAGE_LINE_MAX = 120

export const messageText = ({
    record,
}: {
    record: Extract<BoardRecord, { kind: 'agent_message' }>
}): { text: string; tone: Tone } => {
    const { from, to, text, status, reason } = record.content
    const why = reason ?? 'no reason given'
    if (status === 'refused') {
        return event({
            text: `${from}'s message to ${to} was refused: ${why}`,
            tone: 'warning',
        })
    }
    const shown = clip({
        text: text.split('\n')[0] ?? '',
        max: MESSAGE_LINE_MAX,
    })
    return status === 'queued'
        ? event({ text: `${from} → ${to}: ${shown}`, tone: 'info' })
        : event({
              text: `${from} → ${to}: ${shown} (not delivered: ${why})`,
              tone: 'warning',
          })
}

const RECALL_POINTS: Record<string, string> = {
    run_start: "the run's start",
    ticket: 'a ticket',
    review: 'a review',
    fix_round: 'a fix round',
}

/**
 * A memory search (#370) adds a row only when a vault failed, since the
 * run goes on without it; the panel counts the rest.
 */
export const recalledText = ({
    record,
}: {
    record: Extract<BoardRecord, { kind: 'memory_recalled' }>
}): { text: string; tone: Tone } | null => {
    const failed = record.content.vaults.filter(({ ok }) => !ok)
    if (failed.length === 0) return null
    const where = RECALL_POINTS[record.content.point] ?? record.content.point
    const at = on({ ticket: record.ticket })
    return event({
        text: `${at}memory search for ${where} failed in ${failed.map(({ vault }) => vault).join(', ')}: ${failed[0]?.error?.split('\n')[0] ?? 'no reason given'} The run goes on.`,
        tone: 'warning',
    })
}

/** The learner's answer (#370): how many memories it proposed, and helped. */
export const learnerFinishedText = ({
    record,
}: {
    record: Extract<BoardRecord, { kind: 'agent_finished' }>
}): { text: string; tone: Tone } => {
    const proposed = record.content.result.memories?.length ?? 0
    const helped = record.content.result.helped?.length ?? 0
    return event({
        text: `The learner proposed ${proposed} ${proposed === 1 ? 'memory' : 'memories'}; ${helped} shown ${helped === 1 ? 'memory' : 'memories'} helped.`,
        tone: 'info',
    })
}

/** What became of the learner's memories (#370), counted. */
export const savedText = ({
    record,
}: {
    record: Extract<BoardRecord, { kind: 'memories_saved' }>
}): { text: string; tone: Tone } => {
    const count = (outcome: string) =>
        record.content.saves.filter((save) => save.outcome === outcome).length
    const failed = count('failed')
    return event({
        text: `Memories saved: ${count('added')} added, ${count('updated')} updated, ${count('refused')} refused, ${failed} failed.`,
        tone: failed > 0 ? 'warning' : 'success',
    })
}

/** A `ship` reply to the stuck final review, in words. */
export const SHIPPED_TEXT =
    'You replied `ship`: the PR opens with the open findings listed at the top.'

/**
 * A final review agent's start (no ticket). A lens's start adds no row (its
 * `lens_finished` says what it found); a fixer's says what it is fixing.
 */
export const finalStartedText = ({
    record,
}: {
    record: Extract<BoardRecord, { kind: 'agent_started' }>
}): { text: string; tone: Tone } | null => {
    const { role, follow_up_of } = record.content
    if (role.endsWith('-lens')) return null
    return follow_up_of === null
        ? event({
              text: `Final review: a fresh ${role} fixes the lenses' findings on the whole run branch.`,
              tone: 'warning',
          })
        : event({
              text: `Final review: the ${role} got the failure back.`,
              tone: 'warning',
          })
}

/**
 * A fixer's answers counted: fixed, won't fix, and passed to the other
 * writer role (`other_role`, #616), the last only when there are any.
 */
const answerCounts = ({
    responses,
}: {
    responses: { response: 'fixed' | 'wont_fix' | 'other_role' }[]
}): string => {
    const count = (answer: string) =>
        responses.filter(({ response }) => response === answer).length
    const passed = count('other_role')
    const counts = `${count('fixed')} fixed, ${count('wont_fix')} won't fix`
    return passed === 0 ? counts : `${counts}, ${passed} for the other role`
}

/** A final review agent's finish (no ticket): a fixer's answers, or none for a lens. */
export const finalFinishedText = ({
    record,
}: {
    record: Extract<BoardRecord, { kind: 'agent_finished' }>
}): { text: string; tone: Tone } | null => {
    const { role, result } = record.content
    if (role.endsWith('-lens')) return null
    const responses = result.finding_responses
    if (responses.length === 0) {
        return event({
            text: `Final review: the ${role} finished.`,
            tone: 'info',
        })
    }
    return event({
        text: `Final review: the ${role} answered the findings: ${answerCounts({ responses })}.`,
        tone: 'info',
    })
}

export const startedText = ({
    before,
    after,
    record,
}: {
    before: BoardState
    after: BoardState
    record: Extract<BoardRecord, { kind: 'agent_started' }>
}): { text: string; tone: Tone } | null => {
    const at = on({ ticket: record.ticket })
    const { role, follow_up_of } = record.content
    const card = before.tickets.find(({ number }) => number === record.ticket)
    const next = after.tickets.find(({ number }) => number === record.ticket)
    const round = next?.fix_round
    switch (startKind({ card, role, follow_up_of })) {
        case 'review_fix':
            return event({
                text: `${at}review fix round ${next?.review_fix_round ?? 1}/${LOOP_CAP}: ${
                    role === 'test-writer'
                        ? 'a fresh test-writer fixes the test findings.'
                        : `the ${role} got the findings back.`
                }`,
                tone: 'warning',
            })
        case 'fix':
            return event({
                text: `${at}fix round ${round ?? 0}/${LOOP_CAP}: the ${role} got the failure back.`,
                tone: 'warning',
            })
        case 'resent':
            return null
        case 'retry':
            return event({
                text: `${at}the ${role} tries again.`,
                tone: 'warning',
            })
        case 'fresh':
            return role === 'ticket-reviewer' &&
                card !== undefined &&
                card.review_fix_round > 0
                ? event({
                      text: `${at}re-review ${next?.review_round ?? 0} of the new changes.`,
                      tone: 'info',
                  })
                : event({ text: `${at}the ${role} started.`, tone: 'info' })
    }
}

export const finishedText = ({
    before,
    record,
}: {
    before: BoardState
    record: Extract<BoardRecord, { kind: 'agent_finished' }>
}): { text: string; tone: Tone } => {
    const at = on({ ticket: record.ticket })
    const { role, result } = record.content
    const card = before.tickets.find(({ number }) => number === record.ticket)
    if (card?.open_check === 'review' && role !== 'ticket-reviewer') {
        return event({
            text: `${at}the ${role} answered the findings: ${answerCounts({ responses: result.finding_responses })}.`,
            tone: 'info',
        })
    }
    if (role === 'test-writer') {
        if (result.outcome === 'already_done') {
            return event({
                text: `${at}the test-writer found the work already done.`,
                tone: 'info',
            })
        }
        return result.outcome === 'nothing_new_to_test'
            ? event({ text: `${at}nothing new to test.`, tone: 'info' })
            : event({ text: `${at}tests written.`, tone: 'info' })
    }
    if (role === 'implementer') {
        return result.outcome === 'bad_test'
            ? event({
                  text: `${at}the implementer sent back a bad test.`,
                  tone: 'warning',
              })
            : event({ text: `${at}code written.`, tone: 'info' })
    }
    if (role === 'ticket-reviewer') {
        const counts = result.findings
            ? reviewCountsText({
                  findings: countFindings({ findings: result.findings }),
                  nits: true,
              })
            : null
        return result.verdict === 'approve'
            ? event({
                  text: `${at}the ticket review approved it${counts ? ` (${counts})` : ''}.`,
                  tone: 'success',
              })
            : event({
                  text: `${at}the ticket review asked for changes${counts ? `: ${counts}` : ''}.`,
                  tone: 'warning',
              })
    }
    return event({ text: `${at}the ${role} finished.`, tone: 'info' })
}
