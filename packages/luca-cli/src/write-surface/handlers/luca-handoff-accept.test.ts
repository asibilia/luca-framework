import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaHandoffAcceptTool } from './luca-handoff-accept.ts'
import { lucaHandoffSendTool } from './luca-handoff-send.ts'

let home: string
let cwd: string

/** Read one envelope back off disk as a plain record. */
function readEnvelope(id: string): Record<string, unknown> {
    return JSON.parse(
        readFileSync(join(home, '.luca/handoff', `${id}.json`), 'utf-8')
    ) as Record<string, unknown>
}

/** Post a fresh `pending` envelope targeted at `cwd` and return its id. */
async function seedPending(): Promise<string> {
    const result = await lucaHandoffSendTool.handler(
        {
            target: { repoPath: cwd, repoName: 'receiver' },
            intent: 'add a websocket reconnect backoff',
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

/** Write `.luca/config.json` at `cwd` with the given auto-accept allowlist. */
async function writeAllowlist(entries: string[]): Promise<void> {
    await writeFile(
        join(cwd, '.luca/config.json'),
        JSON.stringify({ handoff: { autoAcceptFrom: entries } })
    )
}

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'luca-handoff-accept-home-'))
    cwd = await mkdtemp(join(tmpdir(), 'luca-handoff-accept-repo-'))
    await mkdir(join(cwd, '.luca'), { recursive: true })
    await writeFile(
        join(cwd, '.luca/state.json'),
        JSON.stringify({
            pipelineStep: 'execute',
            sessionId: 'run_test_accept',
            currentPhase: 0,
            roadmap: [],
        })
    )
})

afterEach(async () => {
    await rm(home, { recursive: true, force: true })
    await rm(cwd, { recursive: true, force: true })
})

describe('lucaHandoffAcceptTool — descriptor', () => {
    test('is phase-agnostic (allowedPhases undefined)', () => {
        expect(lucaHandoffAcceptTool.allowedPhases).toBeUndefined()
    })
})

describe('lucaHandoffAcceptTool — human acceptance', () => {
    test('moves a pending envelope to accepted and records the human path', async () => {
        const id = await seedPending()

        const result = await lucaHandoffAcceptTool.handler(
            { id, auto: false },
            { cwd, homedir: home }
        )
        expect(result.isError).toBeUndefined()

        const envelope = readEnvelope(id)
        expect(envelope.status).toBe('accepted')
        const history = envelope.statusHistory as { note?: string }[]
        expect(history).toHaveLength(1)
        expect(history[0]!.note).toContain('human operator')
    })

    test('needs no allowlist at all — a bare accept never consults one', async () => {
        const id = await seedPending()
        // Deliberately no .luca/config.json handoff section written.
        const result = await lucaHandoffAcceptTool.handler(
            { id, auto: false },
            { cwd, homedir: home }
        )
        expect(result.isError).toBeUndefined()
        expect(readEnvelope(id).status).toBe('accepted')
    })
})

describe('lucaHandoffAcceptTool — --auto is allowlist-gated', () => {
    test('refuses --auto when no allowlist is configured, leaving status pending', async () => {
        const id = await seedPending()

        const result = await lucaHandoffAcceptTool.handler(
            { id, auto: true },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]!.text).toContain('--auto')
        expect(readEnvelope(id).status).toBe('pending')
    })

    test('refuses --auto when the allowlist is empty', async () => {
        const id = await seedPending()
        await writeAllowlist([])

        const result = await lucaHandoffAcceptTool.handler(
            { id, auto: true },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(readEnvelope(id).status).toBe('pending')
    })

    test('accepts --auto when the origin repo is allowlisted, recording the auto path', async () => {
        const id = await seedPending()
        // `send` stamps origin.repoPath = ctx.cwd, so allowlist cwd itself.
        await writeAllowlist([cwd])

        const result = await lucaHandoffAcceptTool.handler(
            { id, auto: true },
            { cwd, homedir: home }
        )
        expect(result.isError).toBeUndefined()

        const envelope = readEnvelope(id)
        expect(envelope.status).toBe('accepted')
        const history = envelope.statusHistory as { note?: string }[]
        expect(history[0]!.note).toContain('autoAcceptFrom')
    })

    // MF-3 regression guard. `isAutoAcceptable` matches on origin only, so
    // without the target check repo A's allowlist would let THIS repo
    // auto-accept an envelope addressed to a third repo (ids are discoverable
    // via `luca handoff list --all-targets`) — forging an `accepted` status on
    // a work order that was never its own. `list` already annotates this case
    // `autoAcceptable: false`, so the annotation and the mutation must agree.
    test('refuses --auto for an envelope addressed to ANOTHER repo, even with the origin allowlisted', async () => {
        const otherRepo = await mkdtemp(join(tmpdir(), 'luca-handoff-third-'))
        try {
            // Envelope sent BY cwd, addressed TO the third repo.
            const sent = await lucaHandoffSendTool.handler(
                {
                    target: { repoPath: otherRepo, repoName: 'third' },
                    intent: 'work for someone else',
                    acceptanceCriteria: [],
                    context: { concepts: [], issueRefs: [], prRefs: [] },
                    callback: {
                        transport: 'local-mailbox' as const,
                        address: '',
                    },
                },
                { cwd, homedir: home }
            )
            const id = /handoff sent: (\S+)/.exec(sent.content[0]!.text)![1]!
            // The origin IS allowlisted here — only the target disqualifies it.
            await writeAllowlist([cwd])

            const result = await lucaHandoffAcceptTool.handler(
                { id, auto: true },
                { cwd, homedir: home }
            )
            expect(result.isError).toBe(true)
            expect(result.content[0]!.text).toContain(otherRepo)
            expect(result.content[0]!.text).toContain('addressed to')

            const envelope = readEnvelope(id)
            expect(envelope.status).toBe('pending')
            expect(envelope.statusHistory).toEqual([])
        } finally {
            await rm(otherRepo, { recursive: true, force: true })
        }
    })

    test('a bare human accept is still allowed cross-repo (documented, deliberate)', async () => {
        const otherRepo = await mkdtemp(join(tmpdir(), 'luca-handoff-third-'))
        try {
            const sent = await lucaHandoffSendTool.handler(
                {
                    target: { repoPath: otherRepo, repoName: 'third' },
                    intent: 'work for someone else',
                    acceptanceCriteria: [],
                    context: { concepts: [], issueRefs: [], prRefs: [] },
                    callback: {
                        transport: 'local-mailbox' as const,
                        address: '',
                    },
                },
                { cwd, homedir: home }
            )
            const id = /handoff sent: (\S+)/.exec(sent.content[0]!.text)![1]!

            const result = await lucaHandoffAcceptTool.handler(
                { id, auto: false },
                { cwd, homedir: home }
            )
            expect(result.isError).toBeUndefined()
            expect(readEnvelope(id).status).toBe('accepted')
        } finally {
            await rm(otherRepo, { recursive: true, force: true })
        }
    })

    test('refuses --auto for an origin that is not on the allowlist', async () => {
        const id = await seedPending()
        await writeAllowlist(['/some/other/repo'])

        const result = await lucaHandoffAcceptTool.handler(
            { id, auto: true },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(readEnvelope(id).status).toBe('pending')
    })
})

describe('lucaHandoffAcceptTool — compare-and-set', () => {
    test('a stale expectedUpdatedAt override is refused with the conflict token', async () => {
        const id = await seedPending()

        const result = await lucaHandoffAcceptTool.handler(
            {
                id,
                auto: false,
                expectedUpdatedAt: '1999-01-01T00:00:00.000Z',
            },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        // The machine-readable reason token, verbatim — the transport's prose
        // message does not contain the word `conflict` itself.
        expect(result.content[0]!.text).toContain('conflict')
        expect(readEnvelope(id).status).toBe('pending')
    })

    test('an unknown id fails with the not-found token and writes nothing', async () => {
        // Seed one real envelope so the mailbox listing is non-trivial, then
        // assert the refused accept left the directory byte-for-byte alone —
        // "writes nothing" has to be observed, not assumed.
        const existing = await seedPending()
        const mailbox = join(home, '.luca/handoff')
        const before = readdirSync(mailbox).sort()

        const result = await lucaHandoffAcceptTool.handler(
            { id: 'no_such_envelope', auto: false },
            { cwd, homedir: home }
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]!.text).toContain('not-found')

        expect(readdirSync(mailbox).sort()).toEqual(before)
        expect(readEnvelope(existing).status).toBe('pending')
    })
})
