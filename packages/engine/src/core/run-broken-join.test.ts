import { existsSync, realpathSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import type { JournalRecord } from '../journal/journal-record'
import {
    BROKEN_JOIN,
    runManyTickets,
    type ManyTicketsRun,
} from '../testing/many-tickets'
import { git } from '../testing/practice-repo'

/**
 * Seam 2, gates that fail after a join: two tickets that don't clash in git
 * but break each other. #21 adds `double`, which imports `helper` from
 * `src/util.ts`; #22 renames `helper` to `identity`. Each passes its gates
 * alone. #21 joins first; after #22 joins, the types gate fails on the run
 * branch, the join is undone, and #22 is fixed on top of the run branch.
 * Real git, gates, journal; scripted agents; no GitHub, no models.
 */

let root = ''
let run: ManyTicketsRun

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

/** #22's records from `after_seq` on, as short strings, in journal order. */
const stepsOf22 = ({ after_seq }: { after_seq: number }): string[] =>
    run.records.flatMap((record) => {
        if (record.ticket !== 22 || record.seq <= after_seq) return []
        switch (record.kind) {
            case 'gates_run':
                return [
                    `gates ${record.content.target} ${record.content.ok ? 'ok' : 'failed'}`,
                ]
            case 'agent_started':
                return [
                    `${record.content.follow_up_of === null ? 'launch' : 'follow_up'} ${record.content.role}`,
                ]
            case 'commit_made':
                return [`commit ${record.content.stage}`]
            case 'ticket_joined':
                return [`joined ${record.content.ok ? 'ok' : 'clashed'}`]
            case 'run_branch_pushed':
                return ['pushed']
            default:
                return []
        }
    })

describe('gates that fail after joining, end to end', () => {
    test('undoes the join, fixes the ticket on top of the run branch, and opens one PR', async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-broken-join-'))
        run = await runManyTickets({ root, scenario: BROKEN_JOIN })

        expect(run.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        expect(ofKind(run.records, 'ticket_stuck')).toEqual([])
        expect(ofKind(run.records, 'agent_failed')).toEqual([])
        expect(run.tracker.pullRequests()).toHaveLength(1)
    }, 120_000)

    test('#21 joins first; #22 joins, its gates fail on the run branch, and the join is undone', () => {
        const joins = ofKind(run.records, 'ticket_joined')
        const [first, broken] = joins
        const [rebased] = ofKind(run.records, 'ticket_rebased')
        const firstPush = ofKind(run.records, 'run_branch_pushed').find(
            ({ ticket }) => ticket === 21
        )
        const failedGates = ofKind(run.records, 'gates_run').find(
            ({ ticket, content }) =>
                ticket === 22 && content.target === 'run_branch'
        )

        expect(
            joins.map(({ ticket, content }) => [ticket, content.ok])
        ).toEqual([
            [21, true],
            [22, true],
            [22, true],
        ])
        expect(first?.seq ?? 0).toBeLessThan(firstPush?.seq ?? 0)
        expect(failedGates?.content.ok).toBe(false)
        expect(
            failedGates?.content.checks.find(({ name }) => name === 'types')
                ?.output
        ).toContain('No matching export')
        if (broken?.content.ok !== true) throw new Error('no ok join')
        expect(rebased?.content).toEqual({
            cause: 'join_gates',
            base_sha: firstPush?.content.sha ?? '',
            tests: [],
            code: [],
            undone: broken.content.shas,
            reinstall: false,
        })
        // The run branch went back to #21's push before anything joined again.
        const between = run.records.filter(
            ({ seq }) =>
                seq > (failedGates?.seq ?? 0) && seq < (rebased?.seq ?? 0)
        )
        expect(between.map(({ kind }) => kind)).toEqual([])
    })

    test('then its gates fail in its worktree, the implementer fixes them, and it is re-reviewed and joins', () => {
        const [rebased] = ofKind(run.records, 'ticket_rebased')

        expect(stepsOf22({ after_seq: rebased?.seq ?? 0 })).toEqual([
            'gates ticket failed',
            'follow_up implementer',
            'gates ticket ok',
            'commit green',
            'launch ticket-reviewer',
            'joined ok',
            'gates run_branch ok',
            'pushed',
        ])
        const calls = run.launches.filter(({ ticket }) => ticket === 22)
        const followUp = calls.find(({ kind }) => kind === 'follow_up')
        expect(followUp?.role).toBe('implementer')
        expect(followUp?.prompt).toContain('The gates failed')
        expect(followUp?.prompt).toContain('No matching export')
        expect(calls.at(-1)?.prompt).toContain('Re-review only the new changes')
        expect(calls.at(-1)?.prompt).toContain(
            'The gates failed on the run branch after it joined.'
        )
        expect(
            ofKind(run.records, 'commit_made')
                .filter(({ ticket }) => ticket === 22)
                .map(({ content }) => content.message)
                .at(-1)
        ).toBe('fix: rejoin #22 Rename helper to identity onto the run branch')
    })

    test("origin's run branch never held the broken commits", async () => {
        const [created] = ofKind(run.records, 'run_branch_created')
        const branch = created?.content.branch ?? ''
        const [rebased] = ofKind(run.records, 'ticket_rebased')
        const pushed = (await git(run.origin, 'rev-list', branch))
            .split('\n')
            .filter(Boolean)

        for (const sha of rebased?.content.undone ?? []) {
            expect(pushed).not.toContain(sha)
        }
        expect(
            (await git(run.origin, 'log', '--format=%s', branch))
                .trim()
                .split('\n')
        ).toEqual([
            'fix: rejoin #22 Rename helper to identity onto the run branch',
            'feat: build #21 Add double',
            'test: add failing tests for #21 Add double',
            'initial',
        ])
        // Every push was of a run branch whose gates passed.
        for (const push of ofKind(run.records, 'run_branch_pushed')) {
            expect(rebased?.content.undone).not.toContain(push.content.sha)
        }
    })

    test('the worktrees are removed; the journal stays', async () => {
        const worktrees = [
            ...ofKind(run.records, 'ticket_worktree_created'),
            ...ofKind(run.records, 'run_branch_created'),
        ]
        const list = (await git(run.repo, 'worktree', 'list', '--porcelain'))
            .split('\n')
            .filter((line) => line.startsWith('worktree '))

        expect(list).toEqual([`worktree ${realpathSync(run.repo)}`])
        for (const { content } of worktrees) {
            expect(existsSync(content.path)).toBe(false)
        }
        expect(existsSync(run.journal_file)).toBe(true)
        expect(run.records.at(-1)?.kind).toBe('worktrees_removed')
    })
})
