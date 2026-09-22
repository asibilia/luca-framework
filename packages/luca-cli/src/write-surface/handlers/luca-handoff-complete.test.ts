import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createLocalMailboxTransport } from '@alecsibilia/luca-core/handoff'

import { lucaHandoffAcceptTool } from './luca-handoff-accept.ts'
import {
    describeCompleteHopFailure,
    lucaHandoffCompleteTool,
} from './luca-handoff-complete.ts'
import { lucaHandoffSendTool } from './luca-handoff-send.ts'

let home: string
let cwd: string

function readEnvelope(id: string): Record<string, unknown> {
    return JSON.parse(
        readFileSync(join(home, '.luca/handoff', `${id}.json`), 'utf-8')
    ) as Record<string, unknown>
}

async function seedPending(): Promise<string> {
    const result = await lucaHandoffSendTool.handler(
        {
            target: { repoPath: cwd, repoName: 'receiver' },
            intent: 'ship the reconnect backoff',
            acceptanceCriteria: [],
            context: { concepts: [], issueRefs: [], prRefs: [] },
            callback: { transport: 'local-mailbox' as const, address: '' },
        },
        { cwd, homedir: home }
    )
    const match = /handoff sent: (\S+)/.exec(result.content[0]!.text)
    if (!match?.[1]) throw new Error(`no id in: ${result.content[0]!.text}`)
    return match[1]
}

/** Seed an envelope already moved to `accepted`. */
async function seedAccepted(): Promise<string> {
    const id = await seedPending()
    const accepted = await lucaHandoffAcceptTool.handler(
        { id, auto: false },
        { cwd, homedir: home }
    )
    if (accepted.isError) throw new Error('seed accept failed')
    return id
}

/**
 * Seed an envelope genuinely parked at `in-progress` — the stranded state a
 * failed hop 2 leaves behind. There is no `start` verb, so the hop is driven
 * through the transport directly; nothing in the CLI can produce this state
 * without also completing it.
 */
async function seedInProgress(): Promise<string> {
    const id = await seedAccepted()
    const transport = createLocalMailboxTransport({ homedir: home })
    const loaded = await transport.read(id)
    if (!loaded.ok) throw new Error('seed read failed')
    const moved = await transport.updateStatus(id, 'in-progress', {
        expectedUpdatedAt: loaded.envelope.updatedAt,
    })
    if (!moved.ok) throw new Error(`seed in-progress failed: ${moved.reason}`)
    return id
}

const goodPayload = {
    outcome: 'success',
    phaseSlug: '07-reconnect-backoff',
    notes: 'landed behind a flag',
    evidence: ['abc1234'],
}

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'luca-handoff-complete-home-'))
    cwd = await mkdtemp(join(tmpdir(), 'luca-handoff-complete-repo-'))
    await mkdir(join(cwd, '.luca'), { recursive: true })
    await writeFile(
        join(cwd, '.luca/state.json'),
        JSON.stringify({
            pipelineStep: 'execute',
            sessionId: 'run_test_complete',
            currentPhase: 0,
            roadmap: [],
        })
    )
})

afterEach(async () => {
    await rm(home, { recursive: true, force: true })
    await rm(cwd, { recursive: true, force: true })
})

describe('lucaHandoffCompleteTool — descriptor', () => {
    test('is phase-agnostic (allowedPhases undefined)', () => {
        expect(lucaHandoffCompleteTool.allowedPhases).toBeUndefined()
    })
})

describe('lucaHandoffCompleteTool — drive-through accepted -> in-progress -> complete', () => {
    test('reaches complete in one call and records BOTH hops in statusHistory', async () => {
        const id = await seedAccepted()

        const result = await lucaHandoffCompleteTool.handler(
            { id, ...goodPayload },
            { cwd, homedir: home }
        )
        expect(result.isError).toBeUndefined()

        const envelope = readEnvelope(id)
        expect(envelope.status).toBe('complete')
        const history = envelope.statusHistory as { status: string }[]
        // accept, then the auto-advanced in-progress hop, then complete.
        expect(history).toHaveLength(3)
        expect(history[0]!.status).toBe('accepted')
        expect(history[1]!.status).toBe('in-progress')
        expect(history[2]!.status).toBe('complete')
    })

    test('attaches the validated result payload in place', async () => {
        const id = await seedAccepted()

        await lucaHandoffCompleteTool.handler(
            { id, ...goodPayload },
            { cwd, homedir: home }
        )

        const stored = readEnvelope(id).result as Record<string, unknown>
        expect(stored.outcome).toBe('success')
        expect(stored.phaseSlug).toBe('07-reconnect-backoff')
        expect(stored.notes).toBe('landed behind a flag')
        expect(stored.evidence).toEqual(['abc1234'])
    })

    test('applies HandoffResultSchema defaults for omitted optional fields', async () => {
        const id = await seedAccepted()

        const result = await lucaHandoffCompleteTool.handler(
            { id, outcome: 'partial', phaseSlug: '08-partial' },
            { cwd, homedir: home }
        )
        expect(result.isError).toBeUndefined()

        const stored = readEnvelope(id).result as Record<string, unknown>
        expect(stored.notes).toBe('')
        expect(stored.evidence).toEqual([])
    })

    test('refuses a second completion — complete is terminal', async () => {
        const id = await seedAccepted()
        await lucaHandoffCompleteTool.handler(
            { id, ...goodPayload },
            { cwd, homedir: home }
        )
        const again = await lucaHandoffCompleteTool.handler(
            { id, ...goodPayload },
            { cwd, homedir: home }
        )
        expect(again.isError).toBe(true)
        expect(again.content[0]!.text).toContain('illegal-transition')
    })

    // The documented recovery for a STRANDED envelope: one already sitting at
    // `in-progress` (hop 1 landed, hop 2 failed) completes in a SINGLE hop.
    // The previous version of this test drove an `accepted` envelope all the
    // way through and then asserted the terminal refusal, so the handler's
    // `status === 'accepted'` guard was never exercised with `in-progress` —
    // gutting it to reject every non-`accepted` status stayed green.
    test('takes the single-hop path from in-progress (the documented recovery)', async () => {
        const id = await seedInProgress()
        const seeded = readEnvelope(id)
        expect(seeded.status).toBe('in-progress')
        const historyBefore = (seeded.statusHistory as unknown[]).length

        const result = await lucaHandoffCompleteTool.handler(
            { id, ...goodPayload },
            { cwd, homedir: home }
        )
        expect(result.isError).toBeUndefined()

        const envelope = readEnvelope(id)
        expect(envelope.status).toBe('complete')
        const history = envelope.statusHistory as {
            status: string
            note?: string
        }[]
        // EXACTLY one new entry — no drive-through hop was taken.
        expect(history).toHaveLength(historyBefore + 1)
        expect(history[history.length - 1]!.status).toBe('complete')
        expect(
            history.some((entry) => entry.note?.includes('auto-advanced'))
        ).toBe(false)
        expect((envelope.result as Record<string, unknown>).outcome).toBe(
            'success'
        )
    })
})

describe('lucaHandoffCompleteTool — payload is validated BEFORE hop 1', () => {
    test('an invalid outcome is refused and NO status change happens (ac-19.3)', async () => {
        const id = await seedAccepted()

        const result = await lucaHandoffCompleteTool.handler(
            { id, outcome: 'nope', phaseSlug: '07-x' },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]!.text).toContain('No status was changed')

        // The proof: hop 1 (accepted -> in-progress) never ran. If the parse
        // were moved after hop 1, this reads "in-progress" and goes RED.
        const envelope = readEnvelope(id)
        expect(envelope.status).toBe('accepted')
        expect(envelope.statusHistory as unknown[]).toHaveLength(1)
        expect(envelope.result).toBeUndefined()
    })

    test('a missing phaseSlug is refused before hop 1', async () => {
        const id = await seedAccepted()

        const result = await lucaHandoffCompleteTool.handler(
            { id, outcome: 'success' } as never,
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]!.text).toContain('phaseSlug')
        expect(readEnvelope(id).status).toBe('accepted')
    })

    test('an empty phaseSlug is refused before hop 1', async () => {
        const id = await seedAccepted()

        const result = await lucaHandoffCompleteTool.handler(
            { id, outcome: 'success', phaseSlug: '' },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(readEnvelope(id).status).toBe('accepted')
    })
})

describe('lucaHandoffCompleteTool — failures', () => {
    test('a stale expectedUpdatedAt override is refused with the conflict token, status unchanged', async () => {
        const id = await seedAccepted()

        const result = await lucaHandoffCompleteTool.handler(
            {
                id,
                ...goodPayload,
                expectedUpdatedAt: '1999-01-01T00:00:00.000Z',
            },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]!.text).toContain('conflict')
        expect(readEnvelope(id).status).toBe('accepted')
    })

    test('an unknown id fails with the not-found token', async () => {
        const result = await lucaHandoffCompleteTool.handler(
            { id: 'no_such_envelope', ...goodPayload },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]!.text).toContain('not-found')
    })

    test('completing a pending envelope is refused by the transition table', async () => {
        const id = await seedPending()

        const result = await lucaHandoffCompleteTool.handler(
            { id, ...goodPayload },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]!.text).toContain('illegal-transition')
        expect(readEnvelope(id).status).toBe('pending')
    })
})

describe('describeCompleteHopFailure', () => {
    test('names the resulting status AND the re-run recovery', () => {
        const text = describeCompleteHopFailure('in-progress')
        expect(text).toContain('in-progress')
        expect(text).toContain('luca handoff complete')
    })
})
