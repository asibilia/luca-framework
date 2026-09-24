import uniqBy from 'lodash/uniqBy'

import { failedChecks } from './fix-loop-text'
import { reasonLine } from './stuck-text'

import { roleTask } from '../agents/role-prompts'
import type { JournalRecord } from '../journal/journal-record'
import type { RunState } from '../journal/replay'
import { MEMORY_ROUTES } from '../memory/memory-routing'

/**
 * The learner's prompt (#370): a digest of the run's journal, built by pure
 * code. Every item and the whole digest are capped, so a long run still
 * fits.
 */

/** The longest one digest item may be, in characters. */
export const DIGEST_ITEM_MAX = 700

/** The longest the whole digest may be, in characters. */
export const DIGEST_MAX = 40_000

/** How the run is about to end, for the learner. */
export type RunEnding = 'pr_opened' | 'stopped_by_user' | 'all_skipped'

const ENDINGS: Record<RunEnding, string> = {
    pr_opened:
        'The final review passed (or was shipped), and the PR opens next.',
    stopped_by_user: 'The owner replied `stop`: the run ends with no PR.',
    all_skipped:
        'Every ticket got stuck and was skipped: the run ends with no PR.',
}

const clip = (text: string): string => {
    const flat = text.trim()
    return flat.length > DIGEST_ITEM_MAX
        ? `${flat.slice(0, DIGEST_ITEM_MAX - 1)}…`
        : flat
}

/** The end of a long output, where errors usually are. */
const tail = (text: string): string => {
    const flat = text.trim()
    return flat.length > DIGEST_ITEM_MAX
        ? `…${flat.slice(-(DIGEST_ITEM_MAX - 1))}`
        : flat
}

const where = (ticket: number | null): string =>
    ticket === null ? 'final review' : `#${ticket}`

const section = (heading: string, lines: string[]): string | null =>
    lines.length === 0 ? null : `## ${heading}\n\n${lines.join('\n')}`

const failureLines = (records: JournalRecord[]): string[] =>
    records.flatMap((record) => {
        if (record.kind === 'red_check' && !record.content.ok) {
            return [
                `- ${where(record.ticket)} red check failed: ${clip(record.content.problems.join('; '))}\n  Output: ${tail(record.content.tests.output)}`,
            ]
        }
        if (record.kind === 'gates_run' && !record.content.ok) {
            const target =
                record.content.target === 'run_branch' && record.ticket !== null
                    ? ' after joining the run branch'
                    : ''
            return [
                `- ${where(record.ticket)} gates failed${target}: ${tail(failedChecks({ gates: record.content }))}`,
            ]
        }
        if (record.kind === 'ticket_joined' && !record.content.ok) {
            return [
                `- ${where(record.ticket)} clashed with the run branch: ${clip(record.content.error)}`,
            ]
        }
        return []
    })

const fixLoopLines = (records: JournalRecord[]): string[] => {
    const counts = new Map<string, number>()
    for (const record of records) {
        if (
            record.kind === 'agent_started' &&
            record.content.follow_up_of !== null
        ) {
            const key = `${where(record.ticket)}, ${record.content.role}`
            counts.set(key, (counts.get(key) ?? 0) + 1)
        }
    }
    return [...counts].map(
        ([key, count]) =>
            `- ${key}: ${count} follow-up${count === 1 ? '' : 's'} (fix rounds and failed tries)`
    )
}

const failedTryLines = (records: JournalRecord[]): string[] =>
    records.flatMap((record) =>
        record.kind === 'agent_failed'
            ? [
                  `- ${where(record.ticket)} ${record.content.role} (${record.content.failure}): ${clip(record.content.error)}`,
              ]
            : []
    )

const findingLines = (records: JournalRecord[]): string[] =>
    records.flatMap((record) => {
        if (record.kind !== 'agent_finished') return []
        const { result, role } = record.content
        if (!('verdict' in result)) return []
        return result.findings.map(
            ({ id, severity, kind, file, title, detail }) =>
                `- ${where(record.ticket)} ${role} ${id} [${severity}, ${kind}]${file === null ? '' : ` (${file})`}: ${clip(`${title}${detail === '' ? '' : ` — ${detail}`}`)}`
        )
    })

const stuckLines = (records: JournalRecord[]): string[] =>
    records.flatMap((record) =>
        record.kind === 'ticket_stuck' || record.kind === 'final_review_stuck'
            ? [
                  `- ${where(record.ticket)} stuck: ${reasonLine({ reason: record.content.reason })}\n  ${clip(record.content.detail)}`,
              ]
            : []
    )

const assumptionLines = (records: JournalRecord[]): string[] =>
    uniqBy(
        records.flatMap((record) =>
            record.kind === 'agent_finished' &&
            'assumptions' in record.content.result
                ? record.content.result.assumptions.map((text) => ({
                      ticket: record.ticket,
                      text,
                  }))
                : []
        ),
        ({ ticket, text }) => `${ticket}\u0000${text}`
    ).map(({ ticket, text }) => `- ${where(ticket)}: ${clip(text)}`)

/**
 * The learner's prompt: its task, the spec, how the run is ending, then a
 * digest of the journal: failures (failed red checks and gates with their
 * output's end, clashes), fix loops, failed tries and their errors, review
 * and final review findings, stuck points, assumptions, run notes, and
 * every memory shown during the run (id, vault, concept, content). Each
 * item is capped at `DIGEST_ITEM_MAX` characters and the whole at
 * `DIGEST_MAX`. Pure.
 *
 * @example
 * const prompt = learnerPrompt({ records, state, ending: 'pr_opened' })
 */
export const learnerPrompt = ({
    records,
    state,
    ending,
}: {
    records: JournalRecord[]
    state: RunState
    ending: RunEnding
}): string => {
    const spec = state.snapshot?.spec
    const tickets = (state.snapshot?.ticket_order ?? []).map((number) => {
        const title = state.snapshot?.tickets[number]?.title ?? ''
        const progress = state.tickets[number]
        const standing =
            progress === undefined
                ? 'unfinished'
                : progress.skipped !== null
                  ? 'skipped'
                  : progress.stuck !== null
                    ? 'stuck'
                    : progress.pushed !== null
                      ? 'joined the run branch'
                      : 'unfinished'
        return `- #${number} ${title}: ${standing}`
    })
    const shown = uniqBy(
        state.memory.shown,
        ({ vault, id }) => `${vault}\u0000${id}`
    ).map(
        ({ id, vault, concept, content }) =>
            `- id ${id} [${vault}] ${concept}: ${clip(content)}`
    )
    const types = Object.keys(MEMORY_ROUTES).join(', ')
    const parts = [
        '# Your role: learner',
        roleTask({ role: 'learner' }),
        `Memory types: ${types}. Anything else is refused.`,
        `## Spec #${spec?.number ?? state.spec_number ?? '?'}: ${spec?.title ?? ''}`,
        `## How the run ends\n\n${ENDINGS[ending]}\n\n${tickets.join('\n')}`,
        section('Failures', failureLines(records)),
        section('Fix loops', fixLoopLines(records)),
        section('Failed tries', failedTryLines(records)),
        section('Review findings', findingLines(records)),
        section('Stuck points', stuckLines(records)),
        section('Assumptions agents made', assumptionLines(records)),
        section(
            'Run notes agents left',
            state.run_notes.map(
                ({ ticket, role, note }) =>
                    `- #${ticket} ${role}: ${clip(note)}`
            )
        ),
        `## Memories shown during this run\n\n${shown.length === 0 ? 'None were shown.' : `List the ids of the ones that actually helped in "helped".\n\n${shown.join('\n')}`}`,
    ].filter((part): part is string => part !== null)
    const text = parts.join('\n\n')
    if (text.length <= DIGEST_MAX) return text
    // The memories shown go last and must stay whole enough to rate, so the
    // middle of the digest is cut.
    const last = parts.at(-1) ?? ''
    const room = Math.max(DIGEST_MAX - last.length - 40, 0)
    return `${parts.slice(0, -1).join('\n\n').slice(0, room)}\n\n[… the digest was cut here]\n\n${last}`
}
