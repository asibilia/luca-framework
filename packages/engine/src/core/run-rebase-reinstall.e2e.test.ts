import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import type { JournalRecord } from '../journal/journal-record'
import { REINSTALL, runManyTickets } from '../testing/many-tickets'
import { git } from '../testing/practice-repo'

/**
 * Seam 2, a rebase across a dependency change: #21 makes the repo depend on
 * its workspace package and joins first; #22 clashes with it, and its
 * worktree, moved onto a run branch whose manifest and lockfile changed,
 * gets the frozen install again. Real git, bun installs (offline), gates,
 * journal; scripted agents.
 */

let root = ''

afterAll(async () => {
    if (root !== '') await rm(root, { recursive: true, force: true })
})

const ofKind = <K extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: K
) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

describe('a rebase across a dependency change, end to end', () => {
    test('the moved worktree gets its frozen install again before the clash is fixed, and the run builds to its PR', async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-reinstall-'))
        const { action, records, origin } = await runManyTickets({
            root,
            scenario: REINSTALL,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(ofKind(records, 'ticket_stuck')).toEqual([])
        const [rebased] = ofKind(records, 'ticket_rebased')
        expect(rebased).toMatchObject({
            ticket: 22,
            content: {
                cause: 'clash',
                code: ['src/index.ts'],
                reinstall: true,
            },
        })
        const installs = ofKind(records, 'dependencies_installed').filter(
            ({ ticket }) => ticket === 22
        )
        expect(installs).toHaveLength(2)
        const [, again] = installs
        expect(again?.seq ?? 0).toBeGreaterThan(rebased?.seq ?? 0)
        expect(again?.content.check).toMatchObject({
            name: 'install',
            command: 'bun install --frozen-lockfile',
            ok: true,
        })
        // The install came before the clash fix (a fresh implementer: the
        // first one's session closed with its green commit).
        const clashFix = ofKind(records, 'agent_started').find(
            ({ ticket, seq, content }) =>
                ticket === 22 &&
                seq > (rebased?.seq ?? 0) &&
                content.role === 'implementer'
        )
        expect(clashFix?.seq ?? 0).toBeGreaterThan(again?.seq ?? 0)
        // Origin's run branch depends on the math package, with its lockfile.
        const [created] = ofKind(records, 'run_branch_created')
        const branch = created?.content.branch ?? ''
        expect(await git(origin, 'show', `${branch}:package.json`)).toContain(
            '"@practice/math": "workspace:*"'
        )
        for (const gates of ofKind(records, 'gates_run')) {
            if (gates.content.target === 'run_branch') {
                expect(gates.content.ok).toBe(true)
            }
        }
    }, 120_000)
})
