import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaHandoffAcceptTool } from './luca-handoff-accept.ts'
import { lucaHandoffRejectTool } from './luca-handoff-reject.ts'
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

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'luca-handoff-reject-home-'))
    cwd = await mkdtemp(join(tmpdir(), 'luca-handoff-reject-repo-'))
    await mkdir(join(cwd, '.luca'), { recursive: true })
    await writeFile(
        join(cwd, '.luca/state.json'),
        JSON.stringify({
            pipelineStep: 'execute',
            sessionId: 'run_test_reject',
            currentPhase: 0,
            roadmap: [],
        })
    )
})

afterEach(async () => {
    await rm(home, { recursive: true, force: true })
    await rm(cwd, { recursive: true, force: true })
})

describe('lucaHandoffRejectTool — descriptor', () => {
    test('is phase-agnostic (allowedPhases undefined)', () => {
        expect(lucaHandoffRejectTool.allowedPhases).toBeUndefined()
    })
})

describe('lucaHandoffRejectTool — rejection', () => {
    test('moves a pending envelope to rejected and stores the reason verbatim', async () => {
        const id = await seedPending()

        const result = await lucaHandoffRejectTool.handler(
            { id, reason: 'declined by operator' },
            { cwd, homedir: home }
        )
        expect(result.isError).toBeUndefined()

        const envelope = readEnvelope(id)
        expect(envelope.status).toBe('rejected')
        const history = envelope.statusHistory as {
            status: string
            note?: string
        }[]
        expect(history).toHaveLength(1)
        expect(history[0]!.status).toBe('rejected')
        expect(history[0]!.note).toBe('declined by operator')
    })

    test('omits the note entirely when no reason is given', async () => {
        const id = await seedPending()

        const result = await lucaHandoffRejectTool.handler(
            { id },
            { cwd, homedir: home }
        )
        expect(result.isError).toBeUndefined()

        const history = readEnvelope(id).statusHistory as { note?: string }[]
        expect(history[0]!.note).toBeUndefined()
    })

    test('rejects an already-accepted envelope (accepted -> rejected is legal)', async () => {
        const id = await seedPending()
        await lucaHandoffAcceptTool.handler(
            { id, auto: false },
            { cwd, homedir: home }
        )

        const result = await lucaHandoffRejectTool.handler(
            { id, reason: 'scope changed' },
            { cwd, homedir: home }
        )
        expect(result.isError).toBeUndefined()
        expect(readEnvelope(id).status).toBe('rejected')
    })

    test('refuses a second rejection — rejected is terminal', async () => {
        const id = await seedPending()
        await lucaHandoffRejectTool.handler({ id }, { cwd, homedir: home })

        const result = await lucaHandoffRejectTool.handler(
            { id },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]!.text).toContain('illegal-transition')
        expect(readEnvelope(id).status).toBe('rejected')
    })
})

describe('lucaHandoffRejectTool — unknown id', () => {
    test('fails with the not-found token and leaves the mailbox untouched', async () => {
        const existing = await seedPending()
        const mailbox = join(home, '.luca/handoff')
        const before = readdirSync(mailbox).sort()

        const result = await lucaHandoffRejectTool.handler(
            { id: 'no_such_envelope' },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]!.text).toContain('not-found')

        expect(readdirSync(mailbox).sort()).toEqual(before)
        expect(readEnvelope(existing).status).toBe('pending')
    })
})

describe('lucaHandoffRejectTool — compare-and-set', () => {
    test('a stale expectedUpdatedAt override is refused with the conflict token', async () => {
        const id = await seedPending()

        const result = await lucaHandoffRejectTool.handler(
            { id, expectedUpdatedAt: '1999-01-01T00:00:00.000Z' },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]!.text).toContain('conflict')
        expect(readEnvelope(id).status).toBe('pending')
    })
})
