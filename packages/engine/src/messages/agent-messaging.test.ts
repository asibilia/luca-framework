import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { MAX_MESSAGES_PER_AGENT } from './agent-messages'
import { createAgentMessaging } from './agent-messaging'

import type { AgentMessaging } from '../agents/agent-launcher'
import type { AgentRole } from '../agents/role-results'
import { createJournal, type Journal } from '../journal/journal'
import {
    agentStarted,
    intakePassed,
    practiceTicket,
    runBranchCreated,
} from '../testing/build-fixtures'

/**
 * One agent's messaging on a real journal file, with tickets #11 and #12
 * building at the same time. Every agent's messaging shares the run's one
 * journal, and keeps nothing in memory: a resumed engine with a fresh
 * journal on the same file hands over exactly what still waits.
 */

let dir = ''
let file = ''

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-engine-messaging-'))
    file = join(dir, 'journal.jsonl')
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** A journal where the test-writers and implementers of #11 and #12 started. */
const bothTicketsLive = (): Journal => {
    const journal = createJournal({ file })
    for (const entry of [
        ...intakePassed({
            tickets: [
                practiceTicket({ number: 11 }),
                practiceTicket({ number: 12, title: 'Add product' }),
            ],
        }),
        runBranchCreated(),
        agentStarted({ ticket: 11, role: 'test-writer' }),
        agentStarted({ ticket: 12, role: 'test-writer' }),
        agentStarted({ ticket: 11, role: 'implementer' }),
        agentStarted({ ticket: 12, role: 'implementer' }),
    ]) {
        journal.append(entry)
    }
    return journal
}

const messagingOf = ({
    journal,
    ticket,
    role,
}: {
    journal: Journal
    ticket: number
    role: AgentRole
}): AgentMessaging => {
    const messaging = createAgentMessaging({ journal, ticket, role })
    if (messaging === null) throw new Error(`${role} has no messaging`)
    return messaging
}

describe('createAgentMessaging', () => {
    test("a message from #11's implementer reaches #12's at its next tool call, once", () => {
        const journal = bothTicketsLive()
        const from = messagingOf({ journal, ticket: 11, role: 'implementer' })
        const to = messagingOf({ journal, ticket: 12, role: 'implementer' })

        expect(
            from.send({ to: 'implementer#12', text: 'sum is in src/sum.ts.' })
        ).toMatchObject({ ok: true })
        const text = to.deliver({ tool_name: 'Edit' })
        expect(text).toContain('from implementer#11')
        expect(text).toContain('sum is in src/sum.ts.')
        expect(to.deliver({ tool_name: 'Read' })).toBeNull()
        expect(journal.read().at(-1)).toMatchObject({
            kind: 'agent_message_delivered',
            ticket: 12,
            role: 'implementer',
            content: {
                to: 'implementer#12',
                ids: ['msg-1'],
                tool_name: 'Edit',
            },
        })
    })

    test('"all" reaches the live agents on the other ticket too', () => {
        const journal = bothTicketsLive()
        messagingOf({ journal, ticket: 11, role: 'test-writer' }).send({
            to: 'all',
            text: 'Tests import from src/index.ts.',
        })
        for (const [ticket, role] of [
            [11, 'implementer'],
            [12, 'test-writer'],
            [12, 'implementer'],
        ] as const) {
            expect(
                messagingOf({ journal, ticket, role }).deliver({
                    tool_name: 'Bash',
                })
            ).toContain('Tests import from src/index.ts.')
        }
    })

    test('a resumed engine hands over what still waits, and counts what was sent, from the journal alone', () => {
        const before = bothTicketsLive()
        const sender = messagingOf({
            journal: before,
            ticket: 11,
            role: 'implementer',
        })
        for (let count = 1; count < MAX_MESSAGES_PER_AGENT; count += 1) {
            sender.send({ to: 'implementer#12', text: `note ${count}` })
        }
        messagingOf({
            journal: before,
            ticket: 12,
            role: 'implementer',
        }).deliver({ tool_name: 'Read' })
        sender.send({ to: 'test-writer#12', text: 'still waiting' })

        // The engine crashed; a new one opens the same journal file.
        const after = createJournal({ file })
        expect(
            messagingOf({
                journal: after,
                ticket: 12,
                role: 'implementer',
            }).deliver({ tool_name: 'Read' })
        ).toBeNull()
        expect(
            messagingOf({
                journal: after,
                ticket: 12,
                role: 'test-writer',
            }).deliver({ tool_name: 'Read' })
        ).toContain('still waiting')
        expect(
            messagingOf({
                journal: after,
                ticket: 11,
                role: 'implementer',
            }).send({ to: 'all', text: 'one more' })
        ).toMatchObject({ ok: false })
    })

    test('a reviewer gets no messaging', () => {
        expect(
            createAgentMessaging({
                journal: bothTicketsLive(),
                ticket: 11,
                role: 'ticket-reviewer',
            })
        ).toBeNull()
    })
})
