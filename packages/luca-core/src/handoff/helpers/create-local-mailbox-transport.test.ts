import { describe, expect, test } from 'bun:test'
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { HANDOFF_SCHEMA_VERSION } from '../constants.ts'
import { createLocalMailboxTransport } from './create-local-mailbox-transport.ts'
import { mailboxDirFor, mailboxPathFor } from './mailbox-path-for.ts'

/** A fresh throwaway homedir per test — the real mailbox is never touched. */
function tempHome(): string {
    return mkdtempSync(join(tmpdir(), 'luca-handoff-'))
}

function envelopeInput(overrides?: Record<string, unknown>): Record<
    string,
    unknown
> {
    return {
        // REQUIRED — the schema has no default, so a sender that omits it is
        // rejected rather than silently folded to the current version.
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
    }
}

describe('createLocalMailboxTransport — send/read round-trip', () => {
    test('a sent envelope round-trips through read with defaults applied', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            const sent = await transport.send(envelopeInput())
            expect(sent.ok).toBe(true)

            const read = await transport.read('repo-a_run_abc_def')
            expect(read.ok).toBe(true)
            if (!read.ok) return
            expect(read.envelope.id).toBe('repo-a_run_abc_def')
            expect(read.envelope.status).toBe('pending')
            expect(read.envelope.target.repoPath).toBe('/Users/x/repo-b')
            expect(read.envelope.intent).toBe(
                'Add a websocket reconnect backoff'
            )
            expect(read.envelope.statusHistory).toEqual([])

            // The file on disk is the source of truth, not an in-memory cache.
            const path = mailboxPathFor('repo-a_run_abc_def', {
                homedir: home,
            })
            expect(path).not.toBeNull()
            const onDisk = JSON.parse(readFileSync(path as string, 'utf-8'))
            expect(onDisk.id).toBe('repo-a_run_abc_def')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('read of an unknown id resolves not-found and never throws', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            const read = await transport.read('nope_1')
            expect(read.ok).toBe(false)
            if (read.ok) return
            expect(read.reason).toBe('not-found')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('a traversal id resolves not-found without revealing the target', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            const read = await transport.read('../../.claude/settings')
            expect(read.ok).toBe(false)
            if (read.ok) return
            expect(read.reason).toBe('not-found')

            const update = await transport.updateStatus(
                '../../.claude/settings',
                'accepted',
                { expectedUpdatedAt: 'anything' }
            )
            expect(update.ok).toBe(false)
            if (update.ok) return
            expect(update.reason).toBe('not-found')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — duplicate-id', () => {
    test('a second send of the same id resolves duplicate-id and does not overwrite', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            expect((await transport.send(envelopeInput())).ok).toBe(true)

            const second = await transport.send(
                envelopeInput({ intent: 'a different intent' })
            )
            expect(second.ok).toBe(false)
            if (second.ok) return
            expect(second.reason).toBe('duplicate-id')

            // The original content survived the rejected write.
            const read = await transport.read('repo-a_run_abc_def')
            expect(read.ok).toBe(true)
            if (!read.ok) return
            expect(read.envelope.intent).toBe(
                'Add a websocket reconnect backoff'
            )
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — send invalid input', () => {
    test('send invalid envelope resolves corrupt and writes nothing', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            const sent = await transport.send({ id: 'bad_1', intent: '' })
            expect(sent.ok).toBe(false)
            if (sent.ok) return
            expect(sent.reason).toBe('corrupt')
            expect(sent.message.length).toBeGreaterThan(0)

            // Nothing was written — not even the mailbox directory.
            const listed = await transport.list()
            expect(listed).toEqual({ ok: true, envelopes: [] })
            expect(() => statSync(mailboxDirFor({ homedir: home }))).toThrow()
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('send invalid id charset never escapes the mailbox directory', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            const sent = await transport.send(
                envelopeInput({ id: '../../.claude/settings' })
            )
            expect(sent.ok).toBe(false)
            if (sent.ok) return
            // The schema rejects the charset before any path is built.
            expect(sent.reason).toBe('corrupt')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — updateStatus illegal-transition', () => {
    test('an illegal-transition target is refused and the file is untouched', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            const before = await transport.read('repo-a_run_abc_def')
            expect(before.ok).toBe(true)
            if (!before.ok) return

            const update = await transport.updateStatus(
                'repo-a_run_abc_def',
                'complete',
                { expectedUpdatedAt: before.envelope.updatedAt }
            )
            expect(update.ok).toBe(false)
            if (update.ok) return
            expect(update.reason).toBe('illegal-transition')

            const after = await transport.read('repo-a_run_abc_def')
            expect(after.ok).toBe(true)
            if (!after.ok) return
            expect(after.envelope.status).toBe('pending')
            expect(after.envelope.updatedAt).toBe(before.envelope.updatedAt)
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('terminal statuses accept no further transition', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            const sent = await transport.read('repo-a_run_abc_def')
            expect(sent.ok).toBe(true)
            if (!sent.ok) return

            const rejected = await transport.updateStatus(
                'repo-a_run_abc_def',
                'rejected',
                { expectedUpdatedAt: sent.envelope.updatedAt }
            )
            expect(rejected.ok).toBe(true)
            if (!rejected.ok) return

            const again = await transport.updateStatus(
                'repo-a_run_abc_def',
                'accepted',
                { expectedUpdatedAt: rejected.envelope.updatedAt }
            )
            expect(again.ok).toBe(false)
            if (again.ok) return
            expect(again.reason).toBe('illegal-transition')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('unknown id resolves not-found rather than illegal-transition', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            const update = await transport.updateStatus('ghost_1', 'accepted', {
                expectedUpdatedAt: '2026-07-21T10:00:00.000Z',
            })
            expect(update.ok).toBe(false)
            if (update.ok) return
            expect(update.reason).toBe('not-found')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — CAS conflict', () => {
    test('reusing a stale expectedUpdatedAt resolves conflict', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            const read = await transport.read('repo-a_run_abc_def')
            expect(read.ok).toBe(true)
            if (!read.ok) return
            const token = read.envelope.updatedAt

            const first = await transport.updateStatus(
                'repo-a_run_abc_def',
                'accepted',
                { expectedUpdatedAt: token }
            )
            expect(first.ok).toBe(true)

            const second = await transport.updateStatus(
                'repo-a_run_abc_def',
                'rejected',
                { expectedUpdatedAt: token }
            )
            expect(second.ok).toBe(false)
            if (second.ok) return
            expect(second.reason).toBe('conflict')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('every write stamps a strictly greater updatedAt', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            const read = await transport.read('repo-a_run_abc_def')
            expect(read.ok).toBe(true)
            if (!read.ok) return

            const accepted = await transport.updateStatus(
                'repo-a_run_abc_def',
                'accepted',
                { expectedUpdatedAt: read.envelope.updatedAt }
            )
            expect(accepted.ok).toBe(true)
            if (!accepted.ok) return
            expect(
                Date.parse(accepted.envelope.updatedAt) >
                    Date.parse(read.envelope.updatedAt)
            ).toBe(true)

            const inProgress = await transport.updateStatus(
                'repo-a_run_abc_def',
                'in-progress',
                { expectedUpdatedAt: accepted.envelope.updatedAt }
            )
            expect(inProgress.ok).toBe(true)
            if (!inProgress.ok) return
            expect(
                Date.parse(inProgress.envelope.updatedAt) >
                    Date.parse(accepted.envelope.updatedAt)
            ).toBe(true)
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — completion mutates in place', () => {
    test('complete attaches result and appends statusHistory on the same file', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            const sent = await transport.read('repo-a_run_abc_def')
            expect(sent.ok).toBe(true)
            if (!sent.ok) return

            const accepted = await transport.updateStatus(
                'repo-a_run_abc_def',
                'accepted',
                { expectedUpdatedAt: sent.envelope.updatedAt, note: 'triaged' }
            )
            expect(accepted.ok).toBe(true)
            if (!accepted.ok) return

            const started = await transport.updateStatus(
                'repo-a_run_abc_def',
                'in-progress',
                { expectedUpdatedAt: accepted.envelope.updatedAt }
            )
            expect(started.ok).toBe(true)
            if (!started.ok) return

            const done = await transport.updateStatus(
                'repo-a_run_abc_def',
                'complete',
                {
                    expectedUpdatedAt: started.envelope.updatedAt,
                    result: {
                        outcome: 'success',
                        phaseSlug: '03-reconnect',
                        notes: 'shipped',
                        evidence: ['sha:abc123'],
                    },
                }
            )
            expect(done.ok).toBe(true)
            if (!done.ok) return
            expect(done.envelope.status).toBe('complete')
            expect(done.envelope.result?.outcome).toBe('success')
            expect(done.envelope.result?.phaseSlug).toBe('03-reconnect')
            expect(done.envelope.statusHistory.map((e) => e.status)).toEqual([
                'accepted',
                'in-progress',
                'complete',
            ])
            expect(done.envelope.statusHistory[0]?.note).toBe('triaged')

            // Same file, same id — one envelope IS the exchange.
            const reread = await transport.read('repo-a_run_abc_def')
            expect(reread.ok).toBe(true)
            if (!reread.ok) return
            expect(reread.envelope.result?.notes).toBe('shipped')
            const listed = await transport.list()
            expect(listed.ok && listed.envelopes.length).toBe(1)
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('complete without a result resolves corrupt naming the missing field', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            const sent = await transport.read('repo-a_run_abc_def')
            expect(sent.ok).toBe(true)
            if (!sent.ok) return

            const accepted = await transport.updateStatus(
                'repo-a_run_abc_def',
                'accepted',
                { expectedUpdatedAt: sent.envelope.updatedAt }
            )
            expect(accepted.ok).toBe(true)
            if (!accepted.ok) return

            const started = await transport.updateStatus(
                'repo-a_run_abc_def',
                'in-progress',
                { expectedUpdatedAt: accepted.envelope.updatedAt }
            )
            expect(started.ok).toBe(true)
            if (!started.ok) return

            const done = await transport.updateStatus(
                'repo-a_run_abc_def',
                'complete',
                { expectedUpdatedAt: started.envelope.updatedAt }
            )
            expect(done.ok).toBe(false)
            if (done.ok) return
            expect(done.reason).toBe('corrupt')
            expect(done.message).toContain('result')

            // The refused completion left the envelope in-progress.
            const after = await transport.read('repo-a_run_abc_def')
            expect(after.ok && after.envelope.status).toBe('in-progress')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — mailbox mode 0o700', () => {
    test('send creates the mailbox directory with mode 0o700', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            const mode =
                statSync(mailboxDirFor({ homedir: home })).mode & 0o777
            expect(mode).toBe(0o700)
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('send re-tightens a PRE-EXISTING world-writable mailbox to 0o700', async () => {
        const home = tempHome()
        try {
            const dir = mailboxDirFor({ homedir: home })
            // `mkdirSync` is a NO-OP on an existing directory, so this is the
            // only path that exercises the `chmodSync` re-assert. The explicit
            // chmod defeats the process umask, which would otherwise mask the
            // mode argument down and make the test pass vacuously.
            mkdirSync(dir, { recursive: true, mode: 0o777 })
            chmodSync(dir, 0o777)
            expect(statSync(dir).mode & 0o777).toBe(0o777)

            const transport = createLocalMailboxTransport({ homedir: home })
            const sent = await transport.send(envelopeInput())
            expect(sent.ok).toBe(true)

            expect(statSync(dir).mode & 0o777).toBe(0o700)
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('send tightens the pre-existing loose parent .luca directory too', async () => {
        const home = tempHome()
        try {
            const dir = mailboxDirFor({ homedir: home })
            const parent = dirname(dir)
            // A group/world-writable `~/.luca` lets a non-owner rename the
            // whole `handoff` directory, which defeats the leaf mode.
            mkdirSync(parent, { recursive: true, mode: 0o777 })
            chmodSync(parent, 0o777)
            expect(statSync(parent).mode & 0o777).toBe(0o777)

            const transport = createLocalMailboxTransport({ homedir: home })
            expect((await transport.send(envelopeInput())).ok).toBe(true)

            expect(statSync(parent).mode & 0o777).toBe(0o700)
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('a created envelope file is owner-only 0o600', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            expect((await transport.send(envelopeInput())).ok).toBe(true)

            const path = mailboxPathFor('repo-a_run_abc_def', { homedir: home })
            expect(path).not.toBeNull()
            expect(statSync(path as string).mode & 0o777).toBe(0o600)
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — io-error', () => {
    test('updateStatus on an unwritable mailbox resolves io-error and leaves no staging file', async () => {
        const home = tempHome()
        const dir = mailboxDirFor({ homedir: home })
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            const read = await transport.read('repo-a_run_abc_def')
            expect(read.ok).toBe(true)
            if (!read.ok) return

            // r-x: the envelope stays readable (so CAS and the transition
            // check pass) but the staging file cannot be created.
            chmodSync(dir, 0o500)
            const update = await transport.updateStatus(
                'repo-a_run_abc_def',
                'accepted',
                { expectedUpdatedAt: read.envelope.updatedAt }
            )
            expect(update.ok).toBe(false)
            if (update.ok) return
            expect(update.reason).toBe('io-error')

            chmodSync(dir, 0o700)
            // No staging residue, and the envelope is untouched.
            expect(readdirSync(dir).filter((e) => e.endsWith('.tmp'))).toEqual(
                []
            )
            const after = await transport.read('repo-a_run_abc_def')
            expect(after.ok && after.envelope.status).toBe('pending')
        } finally {
            try {
                chmodSync(dir, 0o700)
            } catch {
                // The directory may never have been created; rmSync copes.
            }
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — list ordering', () => {
    test('list returns envelopes by createdAt ascending with id as tiebreak', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            // Sent in an order that is neither createdAt order nor id order,
            // so a raw readdir cannot accidentally satisfy the assertion.
            await transport.send(
                envelopeInput({
                    id: 'zz_second',
                    createdAt: '2026-07-21T11:00:00.000Z',
                    updatedAt: '2026-07-21T11:00:00.000Z',
                })
            )
            await transport.send(
                envelopeInput({
                    id: 'aa_oldest',
                    createdAt: '2026-07-21T09:00:00.000Z',
                    updatedAt: '2026-07-21T09:00:00.000Z',
                })
            )
            await transport.send(
                envelopeInput({
                    id: 'aa_second',
                    createdAt: '2026-07-21T11:00:00.000Z',
                    updatedAt: '2026-07-21T11:00:00.000Z',
                })
            )

            const listed = await transport.list()
            expect(listed.ok).toBe(true)
            if (!listed.ok) return
            expect(listed.envelopes.map((e) => e.id)).toEqual([
                'aa_oldest',
                'aa_second',
                'zz_second',
            ])
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — list filters', () => {
    test('status filter returns only envelopes in that status', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput({ id: 'repo-a_one' }))
            await transport.send(envelopeInput({ id: 'repo-a_two' }))
            const one = await transport.read('repo-a_one')
            expect(one.ok).toBe(true)
            if (!one.ok) return
            await transport.updateStatus('repo-a_one', 'accepted', {
                expectedUpdatedAt: one.envelope.updatedAt,
            })

            const accepted = await transport.list({ status: 'accepted' })
            expect(accepted.ok).toBe(true)
            if (!accepted.ok) return
            expect(accepted.envelopes.map((e) => e.id)).toEqual(['repo-a_one'])

            const pending = await transport.list({ status: 'pending' })
            expect(pending.ok && pending.envelopes.map((e) => e.id)).toEqual([
                'repo-a_two',
            ])
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('target filter returns only envelopes addressed to that repo path', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(
                envelopeInput({
                    id: 'repo-a_to_b',
                    target: { repoPath: '/Users/x/repo-b' },
                })
            )
            await transport.send(
                envelopeInput({
                    id: 'repo-a_to_c',
                    target: { repoPath: '/Users/x/repo-c' },
                })
            )

            const forB = await transport.list({
                targetRepoPath: '/Users/x/repo-b',
            })
            expect(forB.ok).toBe(true)
            if (!forB.ok) return
            expect(forB.envelopes.map((e) => e.id)).toEqual(['repo-a_to_b'])

            const forNobody = await transport.list({
                targetRepoPath: '/Users/x/repo-z',
            })
            expect(forNobody.ok && forNobody.envelopes).toEqual([])
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('status filter and target filter compose', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(
                envelopeInput({
                    id: 'repo-a_to_b',
                    target: { repoPath: '/Users/x/repo-b' },
                })
            )
            await transport.send(
                envelopeInput({
                    id: 'repo-a_to_c',
                    target: { repoPath: '/Users/x/repo-c' },
                })
            )
            const toB = await transport.read('repo-a_to_b')
            expect(toB.ok).toBe(true)
            if (!toB.ok) return
            await transport.updateStatus('repo-a_to_b', 'accepted', {
                expectedUpdatedAt: toB.envelope.updatedAt,
            })

            const both = await transport.list({
                status: 'accepted',
                targetRepoPath: '/Users/x/repo-c',
            })
            expect(both.ok && both.envelopes).toEqual([])
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — empty mailbox', () => {
    test('list on an empty mailbox (missing directory) resolves ok with no envelopes', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            const listed = await transport.list()
            expect(listed).toEqual({ ok: true, envelopes: [] })
            // list must NOT create the directory — only send does.
            expect(() => statSync(mailboxDirFor({ homedir: home }))).toThrow()
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})

describe('createLocalMailboxTransport — corrupt files', () => {
    test('list skips a corrupt file instead of throwing', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            writeFileSync(
                join(mailboxDirFor({ homedir: home }), 'half_written.json'),
                'not json',
                'utf-8'
            )

            const listed = await transport.list()
            expect(listed.ok).toBe(true)
            if (!listed.ok) return
            expect(listed.envelopes.map((e) => e.id)).toEqual([
                'repo-a_run_abc_def',
            ])
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('read corrupt file resolves corrupt', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            writeFileSync(
                join(mailboxDirFor({ homedir: home }), 'half_written.json'),
                '{"id": "half_written",',
                'utf-8'
            )

            const read = await transport.read('half_written')
            expect(read.ok).toBe(false)
            if (read.ok) return
            expect(read.reason).toBe('corrupt')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('read corrupt schema-invalid file resolves corrupt, not not-found', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            writeFileSync(
                join(mailboxDirFor({ homedir: home }), 'shaped_wrong.json'),
                JSON.stringify({ id: 'shaped_wrong', intent: '' }),
                'utf-8'
            )

            const read = await transport.read('shaped_wrong')
            expect(read.ok).toBe(false)
            if (read.ok) return
            expect(read.reason).toBe('corrupt')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })

    test('read of an unknown schemaVersion resolves schema-version-mismatch', async () => {
        const home = tempHome()
        try {
            const transport = createLocalMailboxTransport({ homedir: home })
            await transport.send(envelopeInput())
            writeFileSync(
                join(mailboxDirFor({ homedir: home }), 'from_future.json'),
                JSON.stringify({
                    ...envelopeInput({ id: 'from_future' }),
                    schemaVersion: 99,
                }),
                'utf-8'
            )

            const read = await transport.read('from_future')
            expect(read.ok).toBe(false)
            if (read.ok) return
            expect(read.reason).toBe('schema-version-mismatch')
        } finally {
            rmSync(home, { recursive: true, force: true })
        }
    })
})
