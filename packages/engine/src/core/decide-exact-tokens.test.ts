import { describe, expect, test } from 'bun:test'

import { decide } from './decide'

import type { AgentRole } from '../agents/role-results'
import type { JournalEntry } from '../journal/journal-record'
import { countedTokens } from '../limits/plan-usage'
import {
    agentSession,
    intakePassed,
    practiceTicket,
    runBranchCreated,
    ticketBuilt,
    ticketPath,
    RUN_BRANCH_PATH,
    SESSIONS,
    withInstalls,
    worktreesRemoved,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1 for exact tokens (#433): the decision step, handed a journal whose
 * agent turns carry their tokens per model, returns usage records whose
 * totals are built from those counts.
 */

const TICKET = practiceTicket({ number: 11 })

/** Decide on a run with one ticket (#11) and these entries after intake. */
const decideAfter = (entries: JournalEntry[]) =>
    decide({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets: [TICKET] }),
                ...withInstalls({ entries }),
            ],
        }),
    })

type Tokens = {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
}

const tokens = (
    input: number,
    output: number,
    cache_read: number,
    cache_creation: number
): Tokens => ({
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cache_read,
    cache_creation_input_tokens: cache_creation,
})

const OPUS = 'claude-opus-5-5'
const HAIKU = 'claude-haiku-4-5-20251001'

/**
 * One agent turn's session as the launcher journals it: a main loop's
 * `usage` that leaves out subagents, and the turn's tokens per model.
 */
const turnSession = ({
    role,
    model_usage,
}: {
    role: AgentRole
    model_usage: Record<string, Tokens>
}): JournalEntry => ({
    kind: 'agent_session',
    ticket: 11,
    role,
    content: {
        role,
        session: {
            session_id: SESSIONS[role],
            usage: tokens(1, 1, 1, 1),
            model_usage,
            rate_limit_events: [],
            billing_error: false,
        },
    },
})

/** Ticket #11 built and pushed, with these sessions after each agent's result. */
const builtWith = (sessions: [JournalEntry, JournalEntry, JournalEntry]) => {
    const steps = ticketBuilt({ ticket: 11 })
    return [
        runBranchCreated(),
        ...steps.slice(0, 3),
        sessions[0],
        ...steps.slice(3, 7),
        sessions[1],
        ...steps.slice(7, 11),
        sessions[2],
        ...steps.slice(11),
    ]
}

const PR_OPENED: JournalEntry = {
    kind: 'pull_request_opened',
    ticket: null,
    role: null,
    content: {
        number: 12,
        url: 'https://github.com/acme/app/pull/12',
        head: 'luca/spec-10-run',
        base: 'main',
        title: 'Practice spec (#10)',
        body: '',
    },
}

describe('decision step: exact tokens', () => {
    test("a pushed ticket's usage record sums its turns' tokens per model, and totals input + output + cache-creation tokens", () => {
        const action = decideAfter(
            builtWith([
                turnSession({
                    role: 'test-writer',
                    model_usage: {
                        [OPUS]: tokens(1000, 2000, 50_000, 3000),
                        [HAIKU]: tokens(100, 200, 400, 300),
                    },
                }),
                turnSession({
                    role: 'implementer',
                    model_usage: { [OPUS]: tokens(1500, 4000, 80_000, 5000) },
                }),
                turnSession({
                    role: 'ticket-reviewer',
                    model_usage: { [OPUS]: tokens(500, 700, 20_000, 800) },
                }),
            ])
        )
        expect(action).toMatchObject({
            type: 'record_usage',
            usage: {
                scope: 'ticket',
                ticket: 11,
                agent_turns: 3,
                tokens: tokens(3100, 6900, 150_400, 9100),
            },
        })
        const usage = action.type === 'record_usage' ? action.usage : null
        expect(usage && countedTokens({ tokens: usage.tokens })).toBe(19_100)
    })

    test("an older journal, with no tokens per model, still replays: the run's usage counts each turn by its main loop's usage", () => {
        const steps = ticketBuilt({ ticket: 11 })
        const ticketUsage: JournalEntry = {
            kind: 'usage_recorded',
            ticket: 11,
            role: null,
            content: {
                scope: 'ticket',
                ticket: 11,
                agent_turns: 3,
                tokens: tokens(30, 300, 0, 0),
                windows: {},
            },
        }
        const paths = [ticketPath(11), RUN_BRANCH_PATH]
        const action = decideAfter([
            runBranchCreated(),
            ...steps.slice(0, 3),
            agentSession({ ticket: 11, role: 'test-writer' }),
            ...steps.slice(3, 7),
            agentSession({ ticket: 11, role: 'implementer' }),
            ...steps.slice(7, 11),
            agentSession({ ticket: 11, role: 'ticket-reviewer' }),
            ...steps.slice(11),
            ticketUsage,
            PR_OPENED,
            worktreesRemoved({ paths }),
        ])
        expect(action).toMatchObject({
            type: 'record_usage',
            usage: {
                scope: 'run',
                ticket: null,
                agent_turns: 3,
                tokens: tokens(30, 300, 0, 0),
            },
        })
        const usage = action.type === 'record_usage' ? action.usage : null
        expect(usage && countedTokens({ tokens: usage.tokens })).toBe(330)
    })
})
