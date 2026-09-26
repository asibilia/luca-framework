import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { AgentSessionSchema } from '../agents/agent-launcher'
import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { countedTokens } from '../limits/plan-usage'
import {
    APPROVE,
    happyTurns,
    PRACTICE_SPEC_NUMBER,
    runPractice,
} from '../testing/practice-repo'

/**
 * Seam 2 for exact tokens (#433): the practice ticket, end to end, with
 * scripted agents that report their tokens per model, a subagent's model
 * included. Those counts land in the journal, and the usage records add
 * them up.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-run-exact-tokens-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
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

/** Each scripted agent's tokens per model, in the order the agents run. */
const MODEL_USAGE: Record<string, Tokens>[] = [
    // The test-writer, whose subagent ran on Haiku.
    {
        [OPUS]: tokens(1000, 2000, 50_000, 3000),
        [HAIKU]: tokens(100, 200, 400, 300),
    },
    // The implementer.
    { [OPUS]: tokens(1500, 4000, 80_000, 5000) },
    // The ticket reviewer.
    { [OPUS]: tokens(500, 700, 20_000, 800) },
    // The final review's architecture lens.
    { [OPUS]: tokens(200, 300, 10_000, 100) },
]

/**
 * A session summary with these tokens per model, and a main loop's usage
 * that leaves subagents out, as the SDK's is.
 */
const sessionWith = ({
    session_id,
    model_usage,
}: {
    session_id: string
    model_usage: Record<string, Tokens>
}) =>
    AgentSessionSchema.parse({
        session_id,
        model: OPUS,
        usage: tokens(1, 1, 1, 1),
        model_usage,
    })

/** The happy path, each agent reporting its tokens per model. */
const turnsWithTokens = (): ScriptedTurn[] => {
    const { testWriter, implementer, reviewer } = happyTurns()
    const [tw, impl, rev, lens] = MODEL_USAGE as [
        Record<string, Tokens>,
        Record<string, Tokens>,
        Record<string, Tokens>,
        Record<string, Tokens>,
    ]
    return [
        {
            ...testWriter,
            session: sessionWith({ session_id: 'tw', model_usage: tw }),
        },
        {
            ...implementer,
            session: sessionWith({ session_id: 'impl', model_usage: impl }),
        },
        {
            ...reviewer,
            session: sessionWith({ session_id: 'rev', model_usage: rev }),
        },
        {
            role: 'architecture-lens',
            ticket: PRACTICE_SPEC_NUMBER,
            result: APPROVE,
            session: sessionWith({ session_id: 'lens', model_usage: lens }),
        },
    ]
}

/** Input + output + cache-creation tokens over every model. */
const counted = (model_usage: Record<string, Tokens>): number =>
    Object.values(model_usage).reduce(
        (total, each) =>
            total +
            each.input_tokens +
            each.output_tokens +
            each.cache_creation_input_tokens,
        0
    )

const usageRecords = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'usage_recorded' ? [record.content] : []
    )

describe('exact tokens in the practice run', () => {
    test("each scripted agent's tokens per model, a subagent's model included, land in the journal", async () => {
        const { action, records } = await runPractice({
            root,
            turns: turnsWithTokens(),
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const sessions = records.flatMap((record) =>
            record.kind === 'agent_session'
                ? [record.content.session as Record<string, unknown>]
                : []
        )
        expect(sessions.map((session) => session.model_usage)).toEqual(
            MODEL_USAGE
        )
    }, 60_000)

    test('the ticket and run usage records total input + output + cache-creation tokens, and the journal adds up to the run total', async () => {
        const { records } = await runPractice({
            root,
            turns: turnsWithTokens(),
        })

        const usage = usageRecords(records)
        expect(usage).toMatchObject([
            {
                scope: 'ticket',
                ticket: 11,
                agent_turns: 3,
                tokens: tokens(3100, 6900, 150_400, 9100),
            },
            {
                scope: 'run',
                ticket: null,
                agent_turns: 4,
                tokens: tokens(3300, 7200, 160_400, 9200),
            },
        ])
        const totals = usage.map((each) =>
            countedTokens({ tokens: each.tokens })
        )
        expect(totals).toEqual([19_100, 19_700])
        const journaled = records.flatMap((record) =>
            record.kind === 'agent_session'
                ? [
                      counted(
                          ((record.content.session as Record<string, unknown>)
                              .model_usage ?? {}) as Record<string, Tokens>
                      ),
                  ]
                : []
        )
        const sum = journaled.reduce((total, each) => total + each, 0)
        expect(totals.at(-1)).toBe(sum)
    }, 60_000)
})
