import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    journalRecords,
    manyTicketTurns,
    runManyTickets,
    SUM_PRODUCT_AVERAGE,
    waitUntil,
    type ManyTicketsRun,
    type ManyTicketsScenario,
} from '../testing/many-tickets'
import { TEST_WRITER_RESULT } from '../testing/practice-repo'

/**
 * Seam 2, agent messages and run notes while tickets build at the same
 * time: the many-ticket practice run (#11 and #12 at once, #11 clashing on
 * top of #12, then #13), with scripted agents that send and receive through
 * the engine's tools. No GitHub, no models.
 *
 * - #11's test-writer, once #12's has started too, sends #12's test-writer a
 *   message, `all` a message, and #12's implementer (not started yet) one;
 *   it leaves a run note.
 * - #12's test-writer makes a tool call once those are journaled, and waits
 *   for #11's test-writer to finish, so its note is in before #12's
 *   implementer starts.
 * - #12's implementer makes a tool call, and sends #11's implementer a
 *   message. #11's first implementer turn makes no tool call, so that
 *   message waits for its clash follow-up, which makes one.
 */

const DIRECT = 'Heads-up for #12: keep one export per line in src/index.ts.'
const BROADCAST = 'Numbers come in as { numbers }, not as a bare array.'
const EARLY = 'For implementer#12: sum lives in src/sum.ts.'
const NOTE = 'Tests import each module directly, not src/index.ts.'
const TO_ELEVEN = 'product is exported from src/index.ts too; keep both lines.'

const messageTurns = ({
    journal_file,
}: {
    journal_file: string
}): ScriptedTurn[] => {
    const started = new Set<number>()
    const [sumWriter, productWriter, sumCoder, productCoder, ...rest] =
        manyTicketTurns({ journal_file })
    if (
        sumWriter === undefined ||
        productWriter === undefined ||
        sumCoder === undefined ||
        productCoder === undefined
    ) {
        throw new Error('The many-ticket turns changed.')
    }
    const sent = (from: string) =>
        journalRecords(journal_file).filter(
            (record) =>
                record.kind === 'agent_message' && record.content.from === from
        ).length
    const clashFix = rest.findIndex(
        ({ role, ticket }) => role === 'implementer' && ticket === 11
    )
    return [
        {
            ...sumWriter,
            act: async (_, tools) => {
                started.add(11)
                await waitUntil({
                    check: () => started.has(12),
                    what: "#12's test-writer to start",
                })
                tools.send_message({ to: 'test-writer#12', text: DIRECT })
                tools.send_message({ to: 'all', text: BROADCAST })
                tools.send_message({ to: 'implementer#12', text: EARLY })
            },
            result: { ...TEST_WRITER_RESULT, run_notes: [NOTE] },
        },
        {
            ...productWriter,
            act: async (_, tools) => {
                started.add(12)
                await waitUntil({
                    check: () => sent('test-writer#11') === 3,
                    what: "#11's test-writer's messages",
                })
                tools.tool_call('Read')
                await waitUntil({
                    check: () =>
                        journalRecords(journal_file).some(
                            (record) =>
                                record.kind === 'agent_finished' &&
                                record.ticket === 11 &&
                                record.content.role === 'test-writer'
                        ),
                    what: "#11's test-writer to finish",
                })
            },
        },
        sumCoder,
        {
            ...productCoder,
            act: async (_, tools) => {
                tools.tool_call('Edit')
                tools.send_message({ to: 'implementer#11', text: TO_ELEVEN })
            },
        },
        ...rest.map(
            (turn, index): ScriptedTurn =>
                index === clashFix
                    ? {
                          ...turn,
                          act: async (_, tools) => {
                              tools.tool_call('Read')
                          },
                      }
                    : turn
        ),
    ]
}

const MESSAGES: ManyTicketsScenario = {
    ...SUM_PRODUCT_AVERAGE,
    turns: messageTurns,
}

const roots: string[] = []

afterAll(async () => {
    await Promise.all(
        roots.map((root) => rm(root, { recursive: true, force: true }))
    )
})

type Kind = JournalRecord['kind']

const ofKind = <K extends Kind>(records: JournalRecord[], kind: K) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

describe('agent messages and run notes across tickets building at once', () => {
    let run: ManyTicketsRun

    test('the run still opens its PR', async () => {
        const root = await mkdtemp(join(tmpdir(), 'luca-engine-messages-'))
        roots.push(root)
        run = await runManyTickets({ root, scenario: MESSAGES })

        expect(run.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        expect(ofKind(run.records, 'agent_failed')).toEqual([])
    }, 120_000)

    test('every message was queued; "all" reached the live test-writer on the other ticket', () => {
        expect(
            ofKind(run.records, 'agent_message').map(({ content }) => ({
                from: content.from,
                to: content.to,
                status: content.status,
                recipients: content.recipients,
            }))
        ).toEqual([
            {
                from: 'test-writer#11',
                to: 'test-writer#12',
                status: 'queued',
                recipients: ['test-writer#12'],
            },
            {
                from: 'test-writer#11',
                to: 'all',
                status: 'queued',
                recipients: ['test-writer#12'],
            },
            {
                from: 'test-writer#11',
                to: 'implementer#12',
                status: 'queued',
                recipients: ['implementer#12'],
            },
            {
                from: 'implementer#12',
                to: 'implementer#11',
                status: 'queued',
                recipients: ['implementer#11'],
            },
        ])
    })

    test("#12's test-writer got #11's messages at its next tool call, while both built", () => {
        const call = run.launches.find(
            ({ role, ticket }) => role === 'test-writer' && ticket === 12
        )
        expect(call?.delivered).toHaveLength(1)
        expect(call?.delivered[0]).toContain(DIRECT)
        expect(call?.delivered[0]).toContain(BROADCAST)
        expect(call?.delivered[0]).not.toContain(EARLY)
    })

    test("#12's implementer got the message sent before it started, at its first tool call", () => {
        const call = run.launches.find(
            ({ role, ticket }) => role === 'implementer' && ticket === 12
        )
        expect(call?.delivered).toEqual([expect.stringContaining(EARLY)])
    })

    test("#11's implementer got #12's message in its clash follow-up, the same session", () => {
        const eleven = run.launches.filter(
            ({ role, ticket }) => role === 'implementer' && ticket === 11
        )
        expect(eleven.map(({ kind, delivered }) => [kind, delivered])).toEqual([
            ['launch', []],
            ['follow_up', [expect.stringContaining(TO_ELEVEN)]],
        ])
        expect(eleven[1]?.session_id).toBe(eleven[0]?.session_id)
    })

    test('each delivery is journaled once, on the receiver', () => {
        expect(
            ofKind(run.records, 'agent_message_delivered').map(
                ({ ticket, role, content }) => ({
                    ticket,
                    role,
                    to: content.to,
                    ids: content.ids,
                })
            )
        ).toEqual([
            {
                ticket: 12,
                role: 'test-writer',
                to: 'test-writer#12',
                ids: ['msg-1', 'msg-2'],
            },
            {
                ticket: 12,
                role: 'implementer',
                to: 'implementer#12',
                ids: ['msg-3'],
            },
            {
                ticket: 11,
                role: 'implementer',
                to: 'implementer#11',
                ids: ['msg-4'],
            },
        ])
    })

    test("#11's test-writer's note reached every later launch on #12 and #13", () => {
        const line = `- ${NOTE} (test-writer, #11)`
        const later = run.launches.filter(
            ({ kind, ticket, role }) =>
                kind === 'launch' &&
                ticket !== 11 &&
                !(ticket === 12 && role === 'test-writer')
        )
        expect(later.length).toBeGreaterThan(0)
        for (const call of later) expect(call.prompt).toContain(line)
    })

    test('reviewers were handed no messages', () => {
        for (const call of run.launches) {
            if (call.role === 'ticket-reviewer') {
                expect(call.delivered).toEqual([])
            }
        }
    })
})
