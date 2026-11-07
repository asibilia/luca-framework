import { SESSIONS } from './agent-turn-fixtures'

import type { JournalEntry } from '../journal/journal-record'

/**
 * Journal builders for the calibration section's tests (#723): one Clef ask
 * with its answer, and the `agent_finished` that shows what a failure
 * really was. Turn them into a run's records with `runOf` from the model
 * score fixtures, which points each answer at the ask just before it.
 */

export type CalibratedJob = 'ticket_order' | 'failure_kind' | 'finding_severity'

/** The failure's record kind a `failure_kind` ask names in its state. */
export type FailureStep =
    | 'gates_run'
    | 'red_check'
    | 'agent_failed'
    | 'ticket_joined'

/** Each job's question id, as the engine asks it. */
const QUESTIONS: Record<CalibratedJob, string> = {
    ticket_order: 'next',
    failure_kind: 'kind',
    finding_severity: 'finding_F1',
}

/** The legend Clef answers a severity score on. */
const SEVERITY_LEGEND = { '0': 'nit', '1': 'should_fix', '2': 'blocker' }

const questionOf = (job: CalibratedJob) => {
    if (job === 'finding_severity') {
        return {
            type: 'score' as const,
            instructions: "How severe is the reviewer's finding?",
            criteria: ['nit', 'should_fix', 'blocker'],
        }
    }
    const options =
        job === 'ticket_order'
            ? ['ticket_12', 'ticket_13']
            : ['code', 'test', 'agent', 'clash']
    return {
        type: 'choice' as const,
        instructions: 'Which one?',
        criteria: Object.fromEntries(options.map((option) => [option, null])),
    }
}

/**
 * One Clef ask about `job` and its answer: `value` at `confidence`, against
 * the engine's `fixed` value for `question` (by default `next`, `kind` or
 * `finding_F1`). `step` goes in the ask's `request.state.step`, for
 * `failure_kind`. `model` is the answering model; left out, the answer has
 * no `model`, as Jev wrote.
 */
export const clefAnswer = ({
    job,
    ticket = 12,
    step,
    question,
    fixed,
    value,
    confidence,
    model,
}: {
    job: CalibratedJob
    ticket?: number | null
    step?: FailureStep
    question?: string
    fixed: string
    value: string | number | null
    confidence: number | null
    model?: string
}): JournalEntry[] => {
    const id = question ?? QUESTIONS[job]
    return [
        {
            kind: 'jev_asked',
            ticket,
            role: null,
            content: {
                job,
                request: {
                    state: step === undefined ? {} : { step },
                    questions: { [id]: questionOf(job) },
                },
                fixed: { [id]: fixed },
                ...(model === undefined ? {} : { model }),
            },
        },
        {
            kind: 'jev_answered',
            ticket,
            role: null,
            content: {
                job,
                asked_seq: 1,
                answers: {
                    [id]: {
                        value,
                        confidence,
                        raw:
                            job === 'finding_severity'
                                ? { legend: SEVERITY_LEGEND }
                                : {},
                    },
                },
                ms: 5,
                ...(model === undefined ? {} : { model }),
            },
        },
    ]
}

export type AgentOutcome =
    | {
          role: 'implementer'
          outcome: 'done' | 'bad_test' | 'environment' | 'needs_setup_change'
      }
    | { role: 'test-writer'; outcome: 'tests_written' | 'needs_setup_change' }

/** What a result with `outcome` carries beside it. */
const detailsOf = (outcome: AgentOutcome['outcome']) => ({
    ...(outcome === 'bad_test'
        ? {
              bad_test: {
                  file: 'src/sum.test.ts',
                  name: 'sum adds two numbers',
                  reason: 'Wrong sum.',
              },
          }
        : {}),
    ...(outcome === 'environment'
        ? { environment: { evidence: 'Port 3000 is in use.' } }
        : {}),
    ...(outcome === 'needs_setup_change'
        ? {
              setup_change: {
                  file: 'bunfig.toml',
                  reason: 'It needs a preload.',
              },
          }
        : {}),
})

/** An `agent_finished` of `role` on `ticket`, with `outcome`. */
export const agentOutcome = ({
    ticket,
    ...turn
}: { ticket: number } & AgentOutcome): JournalEntry => {
    const details = detailsOf(turn.outcome)
    return turn.role === 'implementer'
        ? {
              kind: 'agent_finished',
              ticket,
              role: turn.role,
              content: {
                  role: turn.role,
                  session_id: SESSIONS[turn.role],
                  result: { outcome: turn.outcome, ...details },
              },
          }
        : {
              kind: 'agent_finished',
              ticket,
              role: turn.role,
              content: {
                  role: turn.role,
                  session_id: SESSIONS[turn.role],
                  result: { outcome: turn.outcome, ...details },
              },
          }
}
