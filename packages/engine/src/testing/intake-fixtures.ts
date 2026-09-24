import { z } from 'zod'

import {
    JournalRecordSchema,
    type JournalEntry,
    type JournalRecord,
} from '../journal/journal-record'
import { TrackerIssueSchema, type TrackerIssue } from '../tracker/tracker'

/**
 * Builders for specs, tickets, and journals in tests. They live in `src` so
 * later end-to-end tests can reuse them.
 */

/** Who wrote the practice spec: the only person whose replies count. */
export const SPEC_OWNER = 'spec-owner'

const SpecOptionsSchema = z.object({
    number: z.number().int().positive(),
    title: z.string().default('Practice spec'),
    author: z.string().default(SPEC_OWNER),
    state: z.enum(['open', 'closed']).default('open'),
    testing_decisions: z.string().default('- Test through the decision step.'),
})

/** A spec issue with a "Testing Decisions" section (empty text drops it). */
export const specIssue = (
    options: z.input<typeof SpecOptionsSchema>
): TrackerIssue => {
    const { number, title, author, state, testing_decisions } =
        SpecOptionsSchema.parse(options)
    const testing =
        testing_decisions === ''
            ? ''
            : `\n## Testing Decisions\n\n${testing_decisions}\n`
    return TrackerIssueSchema.parse({
        number,
        title,
        state,
        body: `## Problem Statement\n\nSomething to build.\n${testing}\n## Out of Scope\n\nNothing.\n`,
        labels: ['ready-for-agent'],
        url: `https://github.com/acme/app/issues/${number}`,
        author,
    })
}

const TicketOptionsSchema = z.object({
    number: z.number().int().positive(),
    title: z.string().default('Practice ticket'),
    state: z.enum(['open', 'closed']).default('open'),
    what_to_build: z.string().default('A thin slice.'),
    criteria: z.array(z.string()).default(['It works']),
    blocked_by_section: z.string().default('None - can start immediately.'),
    blocked_by: z.array(z.number().int().positive()).default([]),
    labels: z.array(z.string()).default(['ready-for-agent']),
})

/** A ticket issue in the `/to-tickets` layout; empty text drops a section. */
export const ticketIssue = (
    options: z.input<typeof TicketOptionsSchema>
): TrackerIssue => {
    const {
        number,
        title,
        state,
        what_to_build,
        criteria,
        blocked_by_section,
        blocked_by,
        labels,
    } = TicketOptionsSchema.parse(options)
    const sections = [
        '## Parent\n\n#10',
        what_to_build === '' ? '' : `## What to build\n\n${what_to_build}`,
        `## Acceptance criteria\n\n${criteria.map((text) => `- [ ] ${text}`).join('\n')}`,
        `## Blocked by\n\n${blocked_by_section}`,
    ]
    return TrackerIssueSchema.parse({
        number,
        title,
        state,
        body: sections.filter((text) => text !== '').join('\n\n'),
        labels,
        blocked_by,
        url: `https://github.com/acme/app/issues/${number}`,
    })
}

/** The fixed time every record built by `recordsFrom` carries. */
export const FIXED_TIME = '2026-01-01T00:00:00.000Z'

/** Turns entries into journal records numbered 1..n, as the journal would. */
export const recordsFrom = ({
    entries,
}: {
    entries: JournalEntry[]
}): JournalRecord[] =>
    entries.map((entry, index) =>
        JournalRecordSchema.parse({
            ...entry,
            seq: index + 1,
            time: FIXED_TIME,
        })
    )

/** The scheduler's own records around each step it takes. */
const STEP_KINDS = new Set<JournalRecord['kind']>([
    'step_started',
    'step_ended',
    'run_resumed',
])

/**
 * The records without the scheduler's step records, for tests about what
 * the steps themselves journaled.
 */
export const withoutStepRecords = (records: JournalRecord[]): JournalRecord[] =>
    records.filter(({ kind }) => !STEP_KINDS.has(kind))
