import { describe, expect, test } from 'bun:test'

import { HANDOFF_SCHEMA_VERSION } from '../constants.ts'
import { HandoffEnvelopeSchema, type HandoffEnvelope } from '../schemas.ts'
import { isAutoAcceptable } from './is-auto-acceptable.ts'

function envelope(overrides?: Record<string, unknown>): HandoffEnvelope {
    return HandoffEnvelopeSchema.parse({
        schemaVersion: HANDOFF_SCHEMA_VERSION,
        id: 'repo-a_run_abc_def',
        createdAt: '2026-07-21T10:00:00.000Z',
        updatedAt: '2026-07-21T10:00:00.000Z',
        origin: {
            repoPath: '/Users/x/repo-a',
            repoName: 'repo-a',
            runId: 'run_abc_def',
            phaseSlug: '01-something',
        },
        target: { repoPath: '/Users/x/repo-b' },
        intent: 'Add a websocket reconnect backoff',
        ...overrides,
    })
}

describe('isAutoAcceptable', () => {
    test('an absent allowlist denies everything', () => {
        expect(isAutoAcceptable(envelope())).toBe(false)
    })

    test('an empty allowlist denies everything', () => {
        expect(isAutoAcceptable(envelope(), [])).toBe(false)
    })

    test('an allowlisted origin repoPath is auto-acceptable', () => {
        expect(isAutoAcceptable(envelope(), ['/Users/x/repo-a'])).toBe(true)
    })

    test('a non-allowlisted origin repoPath is not auto-acceptable', () => {
        expect(isAutoAcceptable(envelope(), ['/Users/x/repo-other'])).toBe(false)
    })

    test('matching is exact — no prefix or substring match', () => {
        expect(isAutoAcceptable(envelope(), ['/Users/x'])).toBe(false)
        expect(isAutoAcceptable(envelope(), ['/Users/x/repo-a/sub'])).toBe(false)
    })

    test('only a pending envelope is a candidate', () => {
        expect(
            isAutoAcceptable(envelope({ status: 'accepted' }), [
                '/Users/x/repo-a',
            ])
        ).toBe(false)
        expect(
            isAutoAcceptable(
                envelope({
                    status: 'complete',
                    result: { outcome: 'success', phaseSlug: '03-x' },
                }),
                ['/Users/x/repo-a']
            )
        ).toBe(false)
    })

    test('is pure — no filesystem or config read', () => {
        const subject = envelope()
        const before = JSON.stringify(subject)
        isAutoAcceptable(subject, ['/Users/x/repo-a'])
        expect(JSON.stringify(subject)).toBe(before)
    })
})
