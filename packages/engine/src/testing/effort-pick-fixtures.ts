import {
    runOf,
    ticketRun,
    type Built,
    type Effort,
    type Severity,
} from './model-score-fixtures'

import { ModelsConfigSchema } from '../config/engine-config'
import type { JournalEntry, JournalRecord } from '../journal/journal-record'
import type { ModelReport } from '../models/model-score'

/**
 * Journal builders for the score report's "Clef's effort picks" section
 * (#663): Clef's shadow-mode `agent_effort` answers, the tickets they were
 * asked on, and a run with its own confidence bar.
 */

/** Clef's `agent_effort` answer about `role`. */
export type EffortPick = {
    role: Built
    pick: Effort
    confidence: number | null
}

/**
 * An `agent_effort` ask about `role`, in shadow mode, and Clef's answer.
 * `runOf` points the answer's `asked_seq` at the ask.
 */
export const effortAsk = ({
    ticket,
    role,
    pick,
    confidence,
}: EffortPick & { ticket: number }): JournalEntry[] => [
    {
        kind: 'jev_asked',
        ticket,
        role,
        content: {
            job: 'agent_effort',
            request: {
                state: {},
                questions: {
                    effort: {
                        type: 'choice',
                        instructions:
                            'Which effort should this agent use? Pick the lowest that will get it right.',
                        criteria: { medium: null, high: null, xhigh: null },
                    },
                },
            },
            fixed: { effort: 'medium' },
            acted: false,
        },
    },
    {
        kind: 'jev_answered',
        ticket,
        role,
        content: {
            job: 'agent_effort',
            asked_seq: 1,
            answers: { effort: { value: pick, confidence, raw: {} } },
            ms: 5,
        },
    },
]

/**
 * One ticket after Clef's effort `picks`: the test-writer at `tw_effort`
 * and the implementer at `impl_effort` (both medium unless told), every
 * ticket review at xhigh, the first review's `findings`, 100 lines.
 */
export const pickedTicket = ({
    ticket,
    tw_effort = 'medium',
    impl_effort = 'medium',
    picks = [],
    findings = [],
}: {
    ticket: number
    tw_effort?: Effort
    impl_effort?: Effort
    picks?: EffortPick[]
    findings?: Severity[]
}): JournalEntry[] => [
    ...picks.flatMap((pick) => effortAsk({ ticket, ...pick })),
    ...ticketRun({
        ticket,
        tw_effort,
        impl_effort,
        review_effort: 'xhigh',
        findings,
    }),
]

/** A run of `body` whose config sets the confidence bar to `bar`. */
export const runWithBar = (
    body: JournalEntry[],
    bar: number
): JournalRecord[] =>
    runOf(body).map((record) =>
        record.kind === 'run_started'
            ? {
                  ...record,
                  content: {
                      ...record.content,
                      config: {
                          ...record.content.config,
                          models: ModelsConfigSchema.parse({
                              confidence_bar: bar,
                          }),
                      },
                  },
              }
            : record
    )

/** The report's "Clef's effort picks" for `role`. */
export const effortPicksOf = (report: ModelReport, role: Built) =>
    report.effort_picks.find((picks) => picks.role === role)

/**
 * The lines of `role`'s "Clef's effort picks (shadow mode)" section in the
 * printed report: the lines after its heading, within the role's part.
 */
export const pickSection = (text: string, role: Built): string[] => {
    const lines = text.split('\n')
    const start = lines.indexOf(role)
    const end = lines.findIndex(
        (line, at) => at > start && line !== '' && !line.startsWith(' ')
    )
    const part = start < 0 ? [] : lines.slice(start + 1, end)
    const heading = part.findIndex(
        (line) => line.trim() === "Clef's effort picks (shadow mode)"
    )
    return heading < 0 ? [] : part.slice(heading + 1)
}
