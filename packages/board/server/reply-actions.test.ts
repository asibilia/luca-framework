import { describe, expect, test } from 'bun:test'

import {
    allowedReplies,
    confirmReplyText,
    postedText,
    replyButtons,
    replyParts,
    unstickCommand,
    type PostedReply,
} from '../shared/reply-actions'

/**
 * The reply buttons' logic (#503), as pure functions: which words each kind
 * of stuck item offers, what each button shows, the confirm question, and
 * the `/luca-unstick` command for "Help me".
 */

const ticket12 = { key: 'ticket-12', ticket: 12, since: '2026-09-28T10:00:00Z' }

const posted = (
    reply: string,
    taken_at: string | null = null
): PostedReply => ({
    key: 'ticket-12',
    since: ticket12.since,
    reply,
    posted_at: '2026-09-28T10:05:00Z',
    comment_url: null,
    taken_at,
})

describe('allowedReplies', () => {
    test('a stuck ticket: retry and skip with its number, and stop', () => {
        expect(allowedReplies({ key: 'ticket-12', ticket: 12 })).toEqual([
            'retry #12',
            'skip #12',
            'stop',
        ])
    })

    test('a stuck final review: retry, stop, and ship', () => {
        expect(allowedReplies({ key: 'final', ticket: null })).toEqual([
            'retry',
            'stop',
            'ship',
        ])
    })

    test('the run stuck on its budget: retry and stop', () => {
        expect(allowedReplies({ key: 'run', ticket: null })).toEqual([
            'retry',
            'stop',
        ])
    })

    test('an item it does not know, or a key that disagrees with its ticket: none', () => {
        expect(allowedReplies({ key: 'lens', ticket: null })).toEqual([])
        expect(allowedReplies({ key: 'ticket-13', ticket: 12 })).toEqual([])
    })
})

describe('replyParts', () => {
    test('splits a word and its ticket', () => {
        expect(replyParts({ reply: 'retry #12' })).toEqual({
            word: 'retry',
            ticket: 12,
        })
        expect(replyParts({ reply: 'ship' })).toEqual({
            word: 'ship',
            ticket: null,
        })
    })

    test('anything else is null', () => {
        expect(replyParts({ reply: 'retry 12' })).toBeNull()
        expect(replyParts({ reply: 'Retry #12' })).toBeNull()
        expect(replyParts({ reply: 'merge' })).toBeNull()
    })
})

describe('replyButtons', () => {
    test('nothing posted: every allowed reply is ready', () => {
        expect(
            replyButtons({ item: ticket12, posted: [], sending: null })
        ).toEqual([
            { reply: 'retry #12', state: 'ready' },
            { reply: 'skip #12', state: 'ready' },
            { reply: 'stop', state: 'ready' },
        ])
    })

    test('while one is sending, it shows so and the others lock', () => {
        expect(
            replyButtons({ item: ticket12, posted: [], sending: 'skip #12' })
        ).toEqual([
            { reply: 'retry #12', state: 'locked' },
            { reply: 'skip #12', state: 'sending' },
            { reply: 'stop', state: 'locked' },
        ])
    })

    test('once one is posted for this item, it shows posted and the others lock', () => {
        expect(
            replyButtons({
                item: ticket12,
                posted: [posted('retry #12')],
                sending: null,
            })
        ).toEqual([
            { reply: 'retry #12', state: 'posted' },
            { reply: 'skip #12', state: 'locked' },
            { reply: 'stop', state: 'locked' },
        ])
    })

    test('a reply posted when the ticket was stuck before counts for nothing now', () => {
        const again = { ...ticket12, since: '2026-09-28T11:00:00Z' }
        expect(
            replyButtons({
                item: again,
                posted: [posted('retry #12')],
                sending: null,
            }).map((button) => button.state)
        ).toEqual(['ready', 'ready', 'ready'])
    })
})

describe('the words', () => {
    test('the confirm question names the reply and the spec', () => {
        expect(
            confirmReplyText({ reply: 'retry #134', spec_number: 133 })
        ).toBe('Post `retry #134` on spec #133?')
    })

    test('posted, then taken', () => {
        expect(postedText({ posted: posted('stop') })).toContain(
            'Waiting for the engine'
        )
        expect(
            postedText({ posted: posted('stop', '2026-09-28T10:06:00Z') })
        ).toBe('Posted `stop`. The engine took it.')
    })

    test('/luca-unstick names the run, and the ticket when there is one', () => {
        expect(
            unstickCommand({ run_id: 'luca-20260928-101500-abcd', ticket: 134 })
        ).toBe('/luca-unstick luca-20260928-101500-abcd #134')
        expect(
            unstickCommand({
                run_id: 'luca-20260928-101500-abcd',
                ticket: null,
            })
        ).toBe('/luca-unstick luca-20260928-101500-abcd')
    })
})
