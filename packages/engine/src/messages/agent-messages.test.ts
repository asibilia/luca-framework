import { describe, expect, test } from 'bun:test'

import {
    deliveryText,
    MAX_MESSAGE_CHARS,
    MAX_MESSAGES_PER_AGENT,
    pendingMessages,
    planMessage,
} from './agent-messages'

import type { AgentMessage, JournalEntry } from '../journal/journal-record'
import {
    agentStarted,
    intakePassed,
    joined,
    practiceTicket,
    runBranchCreated,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1: the message rules, journal in, decision out. Pure: no files, no
 * agents. Tickets #11 and #12 are in the run.
 */

const TICKETS = [
    practiceTicket({ number: 11 }),
    practiceTicket({ number: 12, title: 'Add product' }),
]

const recordsAfter = (entries: JournalEntry[]) =>
    recordsFrom({
        entries: [
            ...intakePassed({ tickets: TICKETS }),
            runBranchCreated(),
            ...entries,
        ],
    })

/** Plans a message on a journal with these entries after intake. */
const plan = ({
    entries,
    from,
    to,
    text,
}: {
    entries: JournalEntry[]
    from: string
    to: string
    text?: string
}): AgentMessage =>
    planMessage({
        records: recordsAfter(entries),
        from,
        to,
        text: text ?? 'Heads-up: sum takes an object.',
    })

/** The journal entry the engine appends for a planned message. */
const sent = (message: AgentMessage): JournalEntry => {
    const [role, ticket] = message.from.split('#')
    return {
        kind: 'agent_message',
        ticket: Number(ticket),
        role: role ?? null,
        content: message,
    }
}

/** Plans a message and returns the entries with it appended. */
const send = ({
    entries,
    from,
    to,
    text,
}: {
    entries: JournalEntry[]
    from: string
    to: string
    text?: string
}): JournalEntry[] => [...entries, sent(plan({ entries, from, to, text }))]

const delivered = ({
    to,
    ids,
}: {
    to: string
    ids: string[]
}): JournalEntry => {
    const [role, ticket] = to.split('#')
    return {
        kind: 'agent_message_delivered',
        ticket: Number(ticket),
        role: role ?? null,
        content: { to, ids, tool_name: 'Read', text: 'x' },
    }
}

const stuck = (ticket: number): JournalEntry => ({
    kind: 'ticket_stuck',
    ticket,
    role: null,
    content: { reason: 'gates_failed', detail: 'still red' },
})

describe('planMessage', () => {
    test('a message to an agent whose ticket is still going is queued for it, even before it starts', () => {
        expect(
            plan({
                entries: [agentStarted({ ticket: 11, role: 'test-writer' })],
                from: 'test-writer#11',
                to: 'implementer#11',
            })
        ).toEqual({
            id: 'msg-1',
            from: 'test-writer#11',
            to: 'implementer#11',
            text: 'Heads-up: sum takes an object.',
            status: 'queued',
            recipients: ['implementer#11'],
            reason: null,
        })
    })

    test('ids count every earlier message, refused ones too', () => {
        const first = send({
            entries: [],
            from: 'test-writer#11',
            to: 'nobody',
        })
        const second = send({
            entries: first,
            from: 'test-writer#11',
            to: 'implementer#11',
        })
        expect(
            plan({
                entries: second,
                from: 'test-writer#11',
                to: 'implementer#11',
            }).id
        ).toBe('msg-3')
    })

    test(`the ${MAX_MESSAGES_PER_AGENT + 1}th message from one agent on a ticket is refused`, () => {
        let entries: JournalEntry[] = []
        for (let count = 0; count < MAX_MESSAGES_PER_AGENT; count += 1) {
            entries = send({
                entries,
                from: 'test-writer#11',
                to: 'implementer#11',
                text: `note ${count + 1}`,
            })
        }
        const sixth = plan({
            entries,
            from: 'test-writer#11',
            to: 'implementer#11',
        })
        expect(sixth).toMatchObject({
            id: `msg-${MAX_MESSAGES_PER_AGENT + 1}`,
            status: 'refused',
            recipients: [],
            reason: expect.stringContaining(String(MAX_MESSAGES_PER_AGENT)),
        })
        // Another agent's count is its own.
        expect(
            plan({ entries, from: 'implementer#11', to: 'test-writer#11' })
                .status
        ).toBe('queued')
    })

    test('refused messages do not count toward the cap; undelivered ones do', () => {
        let entries = send({
            entries: [],
            from: 'test-writer#11',
            to: 'ticket-reviewer#11',
        })
        entries = [...entries, stuck(12)]
        entries = send({
            entries,
            from: 'test-writer#11',
            to: 'implementer#12',
        })
        for (let count = 0; count < MAX_MESSAGES_PER_AGENT - 1; count += 1) {
            entries = send({
                entries,
                from: 'test-writer#11',
                to: 'implementer#11',
            })
        }
        expect(
            plan({ entries, from: 'test-writer#11', to: 'implementer#11' })
                .status
        ).toBe('refused')
        expect(
            plan({
                entries: entries.slice(0, -1),
                from: 'test-writer#11',
                to: 'implementer#11',
            }).status
        ).toBe('queued')
    })

    test('reviewers can neither send nor receive', () => {
        expect(
            plan({
                entries: [],
                from: 'ticket-reviewer#11',
                to: 'implementer#11',
            })
        ).toMatchObject({ status: 'refused', reason: expect.any(String) })
        expect(
            plan({
                entries: [],
                from: 'implementer#11',
                to: 'ticket-reviewer#11',
            })
        ).toMatchObject({ status: 'refused', reason: expect.any(String) })
    })

    const refusals: [string, { from?: string; to: string; text?: string }][] = [
        ['a malformed address', { to: 'the implementer' }],
        ['an unknown role', { to: 'learner#11' }],
        ['the sender itself', { to: 'test-writer#11' }],
        ['a ticket not in the run', { to: 'implementer#99' }],
        ['empty text', { to: 'implementer#11', text: '   ' }],
        [
            'text over the limit',
            {
                to: 'implementer#11',
                text: 'x'.repeat(MAX_MESSAGE_CHARS + 1),
            },
        ],
        ['a sender with no address', { from: 'engine', to: 'all' }],
    ]
    test.each(refusals)('refuses %s', (_, { from, to, text }) => {
        const message = plan({
            entries: [],
            from: from ?? 'test-writer#11',
            to,
            text,
        })
        expect(message).toMatchObject({ status: 'refused', recipients: [] })
        expect(message.reason).not.toBeNull()
    })

    test('a message to an agent whose ticket is over is not delivered, and says why', () => {
        for (const over of [
            stuck(11),
            joined({ ticket: 11 }),
            {
                kind: 'pull_request_opened',
                ticket: null,
                role: null,
                content: {
                    number: 1,
                    url: 'u',
                    head: 'h',
                    base: 'main',
                    title: 't',
                    body: 'b',
                },
            } satisfies JournalEntry,
        ]) {
            expect(
                plan({
                    entries: [over],
                    from: 'test-writer#12',
                    to: 'implementer#11',
                })
            ).toMatchObject({
                status: 'not_delivered',
                recipients: [],
                reason: expect.stringContaining('#11'),
            })
        }
    })

    test('"all" reaches every other test-writer and implementer that started on a ticket still going', () => {
        const entries = [
            agentStarted({ ticket: 11, role: 'test-writer' }),
            agentStarted({ ticket: 11, role: 'implementer' }),
            agentStarted({ ticket: 11, role: 'ticket-reviewer' }),
            joined({ ticket: 11 }),
            agentStarted({ ticket: 12, role: 'test-writer' }),
            agentStarted({ ticket: 12, role: 'test-writer' }),
            agentStarted({ ticket: 12, role: 'implementer' }),
        ]
        expect(
            plan({ entries, from: 'implementer#12', to: 'all' })
        ).toMatchObject({
            status: 'queued',
            to: 'all',
            recipients: ['test-writer#12'],
        })
    })

    test('"all" with nobody else working is not delivered', () => {
        expect(
            plan({
                entries: [agentStarted({ ticket: 11, role: 'test-writer' })],
                from: 'test-writer#11',
                to: 'all',
            })
        ).toMatchObject({ status: 'not_delivered', reason: expect.any(String) })
    })
})

describe('pendingMessages', () => {
    test('hands over queued messages oldest first, and each only once', () => {
        let entries = send({
            entries: [],
            from: 'test-writer#11',
            to: 'implementer#11',
            text: 'first',
        })
        entries = send({
            entries,
            from: 'test-writer#11',
            to: 'implementer#11',
            text: 'second',
        })
        const pending = pendingMessages({
            records: recordsAfter(entries),
            address: 'implementer#11',
        })
        expect(pending.map(({ id, text }) => ({ id, text }))).toEqual([
            { id: 'msg-1', text: 'first' },
            { id: 'msg-2', text: 'second' },
        ])
        expect(
            pendingMessages({
                records: recordsAfter([
                    ...entries,
                    delivered({ to: 'implementer#11', ids: ['msg-1'] }),
                ]),
                address: 'implementer#11',
            }).map(({ id }) => id)
        ).toEqual(['msg-2'])
        // Nothing is waiting for the sender.
        expect(
            pendingMessages({
                records: recordsAfter(entries),
                address: 'test-writer#11',
            })
        ).toEqual([])
    })

    test('refused and undelivered messages are never handed over', () => {
        const entries = send({
            entries: [stuck(12)],
            from: 'test-writer#11',
            to: 'implementer#12',
        })
        expect(
            pendingMessages({
                records: recordsAfter(entries),
                address: 'implementer#12',
            })
        ).toEqual([])
    })

    test("nothing is handed over once the receiver's ticket is over", () => {
        const entries = send({
            entries: [],
            from: 'test-writer#11',
            to: 'implementer#11',
        })
        expect(
            pendingMessages({
                records: recordsAfter([...entries, stuck(11)]),
                address: 'implementer#11',
            })
        ).toEqual([])
    })

    test('a message to "all" waits for each recipient separately', () => {
        const entries = send({
            entries: [
                agentStarted({ ticket: 11, role: 'test-writer' }),
                agentStarted({ ticket: 12, role: 'implementer' }),
            ],
            from: 'implementer#11',
            to: 'all',
        })
        const after = [
            ...entries,
            delivered({ to: 'test-writer#11', ids: ['msg-1'] }),
        ]
        expect(
            pendingMessages({
                records: recordsAfter(after),
                address: 'test-writer#11',
            })
        ).toEqual([])
        expect(
            pendingMessages({
                records: recordsAfter(after),
                address: 'implementer#12',
            }).map(({ id }) => id)
        ).toEqual(['msg-1'])
    })
})

describe('deliveryText', () => {
    test('one line per message, naming its id and sender, and that nobody replies', () => {
        const text = deliveryText({
            messages: [
                {
                    id: 'msg-3',
                    from: 'test-writer#11',
                    to: 'implementer#11',
                    text: 'sum takes an object.',
                    status: 'queued',
                    recipients: ['implementer#11'],
                    reason: null,
                },
                {
                    id: 'msg-4',
                    from: 'test-writer#11',
                    to: 'all',
                    text: 'Tests use bun:test.',
                    status: 'queued',
                    recipients: ['implementer#11'],
                    reason: null,
                },
            ],
        })
        const lines = text.split('\n')
        expect(lines).toHaveLength(2)
        expect(lines[0]).toStartWith('[Agent message msg-3 from test-writer#11')
        expect(lines[0]).toContain('no reply')
        expect(lines[0]).toEndWith(']: sum takes an object.')
        expect(lines[1]).toEndWith(']: Tests use bun:test.')
    })
})
