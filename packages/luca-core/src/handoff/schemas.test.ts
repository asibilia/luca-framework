import { describe, expect, test } from 'bun:test'

import { HANDOFF_SCHEMA_VERSION } from './constants.ts'
import {
    HandoffEnvelopeSchema,
    HandoffFailureReason,
    HandoffFilterSchema,
    HandoffResultSchema,
    HandoffStatus,
} from './schemas.ts'

/** Minimal envelope input — only the fields with no schema default. */
function minimalEnvelopeInput(): Record<string, unknown> {
    return {
        // REQUIRED: there is no schemaVersion default, so every writer stamps
        // it. An absent version is a schema failure, never a fold to v1.
        schemaVersion: HANDOFF_SCHEMA_VERSION,
        id: 'luca-framework_run_abc_def',
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
    }
}

describe('HandoffEnvelopeSchema — defaults', () => {
    test('defaults materialize from the schema, not from destructuring', () => {
        const parsed = HandoffEnvelopeSchema.parse(minimalEnvelopeInput())

        // schemaVersion is NOT in this list — it has no default (see below).
        expect(parsed.status).toBe('pending')
        expect(parsed.acceptanceCriteria).toEqual([])
        expect(parsed.statusHistory).toEqual([])
        expect(parsed.context).toEqual({
            concepts: [],
            issueRefs: [],
            prRefs: [],
        })
        expect(parsed.callback).toEqual({
            transport: 'local-mailbox',
            address: '',
        })
        expect(parsed.result).toBeUndefined()
    })

    test('HandoffResultSchema defaults notes and evidence', () => {
        const parsed = HandoffResultSchema.parse({
            outcome: 'success',
            phaseSlug: '03-reconnect',
        })

        expect(parsed).toEqual({
            outcome: 'success',
            phaseSlug: '03-reconnect',
            notes: '',
            evidence: [],
        })
    })
})

describe('HandoffEnvelopeSchema — cross-field invariant', () => {
    test('invariant: status complete without result is rejected', () => {
        const result = HandoffEnvelopeSchema.safeParse({
            ...minimalEnvelopeInput(),
            status: 'complete',
        })

        expect(result.success).toBe(false)
        expect(
            result.success
                ? []
                : result.error.issues.map((issue) => issue.path.join('.'))
        ).toContain('result')
    })

    test('invariant: status complete WITH result parses', () => {
        const result = HandoffEnvelopeSchema.safeParse({
            ...minimalEnvelopeInput(),
            status: 'complete',
            result: { outcome: 'success', phaseSlug: '03-reconnect' },
        })

        expect(result.success).toBe(true)
    })

    test('invariant: remote callback requires a non-empty address', () => {
        const bad = HandoffEnvelopeSchema.safeParse({
            ...minimalEnvelopeInput(),
            callback: { transport: 'remote' },
        })
        const good = HandoffEnvelopeSchema.safeParse({
            ...minimalEnvelopeInput(),
            callback: { transport: 'remote', address: 'wss://hub.example/x' },
        })

        expect(bad.success).toBe(false)
        expect(good.success).toBe(true)
    })

    test('invariant: updatedAt may not precede createdAt', () => {
        const result = HandoffEnvelopeSchema.safeParse({
            ...minimalEnvelopeInput(),
            createdAt: '2026-07-21T10:00:00.000Z',
            updatedAt: '2026-07-21T09:59:59.999Z',
        })

        expect(result.success).toBe(false)
    })

    test('invariant: an id outside ENVELOPE_ID_RE is rejected', () => {
        const result = HandoffEnvelopeSchema.safeParse({
            ...minimalEnvelopeInput(),
            id: '../../.claude/settings',
        })

        expect(result.success).toBe(false)
    })
})

describe('HandoffEnvelopeSchema — unknown keys', () => {
    test('unknown keys are stripped, not preserved and not rejected', () => {
        const parsed = HandoffEnvelopeSchema.parse({
            ...minimalEnvelopeInput(),
            somethingNobodyDeclared: 'hostile',
        })

        expect('somethingNobodyDeclared' in parsed).toBe(false)
        expect(parsed.intent).toBe('Add a websocket reconnect backoff')
    })
})

describe('HandoffEnvelopeSchema — schemaVersion', () => {
    test('schemaVersion mismatch is rejected, never folded', () => {
        const future = HandoffEnvelopeSchema.safeParse({
            ...minimalEnvelopeInput(),
            schemaVersion: HANDOFF_SCHEMA_VERSION + 1,
        })

        expect(future.success).toBe(false)
        expect(
            future.success
                ? []
                : future.error.issues.map((issue) => issue.path.join('.'))
        ).toContain('schemaVersion')
    })

    test('an envelope with NO schemaVersion is rejected, not folded to v1', () => {
        const { schemaVersion, ...withoutVersion } = minimalEnvelopeInput()
        expect(schemaVersion).toBe(HANDOFF_SCHEMA_VERSION)

        const parsed = HandoffEnvelopeSchema.safeParse(withoutVersion)

        expect(parsed.success).toBe(false)
        expect(
            parsed.success
                ? []
                : parsed.error.issues.map((issue) => issue.path.join('.'))
        ).toContain('schemaVersion')
    })
})

describe('HandoffFailureReason — reason union', () => {
    test('reason union is exhaustively the 8 documented members', () => {
        const expected: HandoffFailureReason[] = [
            'conflict',
            'corrupt',
            'duplicate-id',
            'illegal-transition',
            'io-error',
            'not-found',
            'not-implemented',
            'schema-version-mismatch',
        ]
        expect([...HandoffFailureReason.options].sort()).toEqual(
            expected.sort()
        )
        expect(HandoffFailureReason.options.length).toBe(8)
    })

    test('reason union rejects an unlisted member', () => {
        expect(HandoffFailureReason.safeParse('mystery-failure').success).toBe(
            false
        )
    })
})

describe('HandoffFilterSchema', () => {
    test('both filter keys are optional and typed', () => {
        expect(HandoffFilterSchema.parse({})).toEqual({})
        expect(
            HandoffFilterSchema.parse({
                status: 'pending',
                targetRepoPath: '/Users/x/repo-b',
            })
        ).toEqual({ status: 'pending', targetRepoPath: '/Users/x/repo-b' })
        expect(HandoffFilterSchema.safeParse({ status: 'nope' }).success).toBe(
            false
        )
    })
})

describe('HandoffStatus', () => {
    test('enumerates the seven lifecycle statuses', () => {
        const expected: HandoffStatus[] = [
            'accepted',
            'cancelled',
            'complete',
            'failed',
            'in-progress',
            'pending',
            'rejected',
        ]
        expect([...HandoffStatus.options].sort()).toEqual(expected.sort())
    })
})
