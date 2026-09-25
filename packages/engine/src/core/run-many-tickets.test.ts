import { existsSync, realpathSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import type { JevClient } from '../jev/jev-client'
import type { JevAnswer, JevQuestion } from '../jev/jev-schemas'
import type { JournalRecord } from '../journal/journal-record'
import {
    ALL_THREE_INDEX,
    runManyTickets,
    SUM_PRODUCT_AVERAGE,
    type ManyTicketsRun,
} from '../testing/many-tickets'
import { git } from '../testing/practice-repo'

/**
 * Seam 2, many tickets in one run: three tickets on the practice repo, with
 * scripted agents, real git, gates, journal, and the in-memory tracker. #11
 * and #12 build at the same time and clash on `src/index.ts`; #13 waits on
 * both. No GitHub, no models.
 */

const roots: string[] = []

const newRoot = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'luca-engine-many-'))
    roots.push(root)
    return root
}

afterAll(async () => {
    await Promise.all(
        roots.map((root) => rm(root, { recursive: true, force: true }))
    )
})

type Kind = JournalRecord['kind']

const ofKind = <K extends Kind>(records: JournalRecord[], kind: K) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

/** The joins, their gates, and the pushes, in journal order. */
const joinSteps = (records: JournalRecord[]): string[] =>
    records.flatMap((record) => {
        switch (record.kind) {
            case 'ticket_joined':
                return [
                    `joined #${record.ticket} ${record.content.ok ? 'ok' : 'clashed'}`,
                ]
            case 'ticket_rebased':
                return [`rebased #${record.ticket}`]
            case 'gates_run':
                return record.content.target === 'run_branch'
                    ? [
                          `gates #${record.ticket} ${record.content.ok ? 'ok' : 'failed'}`,
                      ]
                    : []
            case 'run_branch_pushed':
                return [`pushed #${record.ticket}`]
            default:
                return []
        }
    })

/** The worktree paths `git worktree list` knows in the repo. */
const worktreeList = async (repo: string): Promise<string[]> =>
    (await git(repo, 'worktree', 'list', '--porcelain'))
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.slice('worktree '.length))

describe('many tickets in one run, end to end, with scripted agents', () => {
    let run: ManyTicketsRun

    test('builds three tickets, #11 and #12 at the same time, and opens one PR', async () => {
        run = await runManyTickets({
            root: await newRoot(),
            scenario: SUM_PRODUCT_AVERAGE,
        })
        const { action, records, tracker } = run

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(ofKind(records, 'agent_failed')).toEqual([])
        expect(ofKind(records, 'ticket_stuck')).toEqual([])
        const pulls = tracker.pullRequests()
        expect(pulls).toHaveLength(1)
        for (const number of [11, 12, 13]) {
            expect(pulls[0]?.body).toContain(`Closes #${number}`)
        }
    }, 120_000)

    test('#12 finished first and joined first; #11 clashed, was fixed on top, and joined; then #13', () => {
        expect(joinSteps(run.records)).toEqual([
            'joined #12 ok',
            'gates #12 ok',
            'pushed #12',
            'joined #11 clashed',
            'rebased #11',
            'joined #11 ok',
            'gates #11 ok',
            'pushed #11',
            'joined #13 ok',
            'gates #13 ok',
            'pushed #13',
        ])
        expect(ofKind(run.records, 'ticket_rebased')[0]?.content).toEqual({
            cause: 'clash',
            base_sha: expect.any(String),
            tests: [],
            code: ['src/index.ts'],
            undone: [],
            reinstall: false,
        })
    })

    test("#11's clash went to its implementer session, and a fresh reviewer re-reviewed the new changes", () => {
        const eleven = run.launches.filter(({ ticket }) => ticket === 11)

        expect(eleven.map(({ kind, role }) => `${kind}:${role}`)).toEqual([
            'launch:test-writer',
            'launch:implementer',
            'launch:ticket-reviewer',
            'follow_up:implementer',
            'launch:ticket-reviewer',
        ])
        const [, implementer, , followUp, reReview] = eleven
        expect(followUp?.session_id).toBe(implementer?.session_id ?? '')
        expect(followUp?.prompt).toContain('conflict markers')
        expect(followUp?.prompt).toContain('- src/index.ts')
        expect(reReview?.prompt).toContain('Re-review only the new changes')
        expect(reReview?.prompt).toContain('- src/index.ts')
        // Its fixed change joined as one commit.
        expect(
            ofKind(run.records, 'commit_made')
                .filter(({ ticket }) => ticket === 11)
                .map(({ content }) => content.message)
        ).toEqual([
            'test: add failing tests for #11 Add sum',
            'feat: build #11 Add sum',
            'fix: rejoin #11 Add sum onto the run branch',
        ])
    })

    test('#13 started only after #11 and #12 had both pushed', () => {
        const started = ofKind(run.records, 'ticket_worktree_created')
        const thirteen = started.find(({ ticket }) => ticket === 13)
        const pushes = ofKind(run.records, 'run_branch_pushed')

        expect(started.map(({ ticket }) => ticket)).toEqual([11, 12, 13])
        for (const number of [11, 12]) {
            const push = pushes.find(({ ticket }) => ticket === number)
            expect(push?.seq ?? Infinity).toBeLessThan(thirteen?.seq ?? 0)
        }
    })

    test("origin's run branch has all three exports, and every gate on it passed", async () => {
        const [created] = ofKind(run.records, 'run_branch_created')
        const branch = created?.content.branch ?? ''

        expect(await git(run.origin, 'show', `${branch}:src/index.ts`)).toBe(
            ALL_THREE_INDEX
        )
        const log = await git(run.origin, 'log', '--format=%s', branch)
        expect(log.trim().split('\n')).toEqual([
            'feat: build #13 Add average',
            'test: add failing tests for #13 Add average',
            'fix: rejoin #11 Add sum onto the run branch',
            'feat: build #12 Add product',
            'test: add failing tests for #12 Add product',
            'initial',
        ])
        for (const gates of ofKind(run.records, 'gates_run')) {
            if (gates.content.target === 'run_branch') {
                expect(gates.content.ok).toBe(true)
            }
        }
    })

    test('#11 and #12 start from the same run-branch commit and share one baseline test run; the reuse is journaled', () => {
        const worktrees = ofKind(run.records, 'ticket_worktree_created')
        const baseOf = (ticket: number) =>
            worktrees.find((record) => record.ticket === ticket)?.content
                .base_sha
        expect(baseOf(11)).toBe(baseOf(12) ?? '')

        const baselines = ofKind(run.records, 'baseline_tests').filter(
            ({ ticket }) => ticket === 11 || ticket === 12
        )
        expect(baselines).toHaveLength(1)
        const ran = baselines[0]?.ticket ?? 0
        const other = ran === 11 ? 12 : 11

        const reused = ofKind(run.records, 'baseline_reused')
        expect(reused.map(({ ticket }) => ticket)).toEqual([other])
        expect(reused[0]?.content).toMatchObject({
            from_ticket: ran,
            base_sha: baseOf(ran),
        })
        expect(reused[0]?.seq ?? 0).toBeGreaterThan(baselines[0]?.seq ?? 0)
    })

    test('#13 starts from a changed run-branch commit and runs a fresh baseline', () => {
        const worktrees = ofKind(run.records, 'ticket_worktree_created')
        const baseOf = (ticket: number) =>
            worktrees.find((record) => record.ticket === ticket)?.content
                .base_sha
        expect(baseOf(13)).not.toBe(baseOf(11) ?? '')

        expect(
            ofKind(run.records, 'baseline_tests').filter(
                ({ ticket }) => ticket === 13
            )
        ).toHaveLength(1)
        // The run reused a baseline, but not for #13.
        const reused = ofKind(run.records, 'baseline_reused')
        expect(reused.length).toBeGreaterThan(0)
        expect(reused.map(({ ticket }) => ticket)).not.toContain(13)
        // #13's baseline saw the sum and product tests #11 and #12 joined.
        const [thirteen] = ofKind(run.records, 'baseline_tests').filter(
            ({ ticket }) => ticket === 13
        )
        expect(
            thirteen?.content.cases.map(({ full_name }) => full_name)
        ).toEqual(expect.arrayContaining(['product > multiplies two numbers']))
    })

    test('every ticket still passed a full red check before its red commit, the full gates before each later commit, and the full gates after each join', () => {
        const { records } = run
        const configured = ['test', 'types', 'lint']
        const before = <K extends Kind>(
            kind: K,
            ticket: number | null,
            seq: number
        ) =>
            ofKind(records, kind)
                .filter((record) => record.ticket === ticket)
                .filter((record) => record.seq < seq)
                .at(-1)

        /** Whether a red check's own test run saw `file`'s new tests fail. */
        const failedNew = (
            red: Extract<JournalRecord, { kind: 'red_check' }> | undefined,
            file: string
        ) =>
            red !== undefined &&
            (red.content.tests.files_without_results.includes(file) ||
                red.content.tests.cases.some(
                    (each) =>
                        each.file.endsWith(file) && each.status === 'failed'
                ))
        const redOf = (ticket: number) =>
            ofKind(records, 'red_check').filter(
                (record) => record.ticket === ticket
            )

        // The ticket that reused a baseline still got a red check that ran
        // the tests itself and saw its new tests fail.
        const [reused] = ofKind(records, 'baseline_reused')
        const reuser = reused?.ticket ?? 0
        const newFile =
            reuser === 12 ? 'src/product.test.ts' : 'src/sum.test.ts'
        expect([11, 12]).toContain(reuser)
        expect(redOf(reuser).map(({ content }) => content.ok)).toEqual([true])
        expect(failedNew(redOf(reuser)[0], newFile)).toBe(true)
        // #13's red check ran the old tests, which passed, and its new ones failed.
        const [thirteenRed] = redOf(13)
        expect(thirteenRed?.content.ok).toBe(true)
        expect(thirteenRed?.content.tests.cases).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    full_name: 'product > multiplies two numbers',
                    status: 'passed',
                }),
                expect.objectContaining({
                    full_name: 'sum > adds two numbers',
                    status: 'passed',
                }),
            ])
        )
        expect(failedNew(thirteenRed, 'src/average.test.ts')).toBe(true)

        const commits = ofKind(records, 'commit_made').filter(
            ({ ticket }) => ticket !== null
        )
        expect(commits.length).toBeGreaterThan(0)
        for (const commit of commits) {
            if (commit.content.stage === 'red') {
                expect(
                    before('red_check', commit.ticket, commit.seq)?.content.ok
                ).toBe(true)
                continue
            }
            const gates = before('gates_run', commit.ticket, commit.seq)
            expect(gates?.content).toMatchObject({ target: 'ticket', ok: true })
            expect(gates?.content.checks.map(({ name }) => name)).toEqual(
                expect.arrayContaining(configured)
            )
        }

        const joins = ofKind(records, 'ticket_joined').filter(
            ({ content }) => content.ok
        )
        expect(joins).toHaveLength(3)
        for (const join of joins) {
            const gates = ofKind(records, 'gates_run').find(
                (record) =>
                    record.ticket === join.ticket && record.seq > join.seq
            )
            const push = ofKind(records, 'run_branch_pushed').find(
                (record) =>
                    record.ticket === join.ticket && record.seq > join.seq
            )
            expect(gates?.content).toMatchObject({
                target: 'run_branch',
                ok: true,
            })
            expect(gates?.content.checks.map(({ name }) => name)).toEqual(
                expect.arrayContaining(configured)
            )
            expect(gates?.seq ?? Infinity).toBeLessThan(push?.seq ?? 0)
        }
    })

    test('the worktrees are removed after the run; the branches and the journal stay', async () => {
        const worktrees = [
            ...ofKind(run.records, 'ticket_worktree_created'),
            ...ofKind(run.records, 'run_branch_created'),
        ].map(({ content }) => content)

        expect(await worktreeList(run.repo)).toEqual([realpathSync(run.repo)])
        for (const { path, branch } of worktrees) {
            expect(existsSync(path)).toBe(false)
            expect(
                (await git(run.repo, 'branch', '--list', branch)).trim()
            ).not.toBe('')
        }
        expect(existsSync(run.journal_file)).toBe(true)
        expect(ofKind(run.records, 'worktrees_removed')).toHaveLength(1)
        expect(run.records.at(-1)?.kind).toBe('worktrees_removed')
    })
})

/**
 * A Jev that picks the last option of every choice (so never the engine's
 * ticket), the top of every score, and yes to every skill.
 */
const lastPick = (question: JevQuestion): JevAnswer => {
    switch (question.type) {
        case 'choice': {
            const choice = Object.keys(question.criteria).at(-1) ?? null
            return { value: choice, confidence: 0.9, raw: { choice } }
        }
        case 'score': {
            const score = question.criteria.at(-1) ?? null
            return { value: score, confidence: 0.9, raw: { score } }
        }
        case 'noul':
            return { value: 0.9, confidence: null, raw: { probability: 0.9 } }
    }
}

const lastPickJev = (): JevClient => ({
    ask: async ({ request }) => ({
        ok: true,
        answers: Object.fromEntries(
            Object.entries(request.questions).map(([id, question]) => [
                id,
                lastPick(question),
            ])
        ),
    }),
})

describe('many tickets with Jev in shadow mode', () => {
    test("Jev's ticket-order pick is journaled and ignored", async () => {
        const { action, records } = await runManyTickets({
            root: await newRoot(),
            jev: { client: lastPickJev() },
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [firstAsk] = ofKind(records, 'jev_asked').filter(
            ({ content }) => content.job === 'ticket_order'
        )
        expect(firstAsk?.content.fixed).toEqual({ next: 'ticket_11' })
        const answer = ofKind(records, 'jev_answered').find(
            ({ content }) => content.asked_seq === firstAsk?.seq
        )
        expect(answer?.content.answers.next?.value).toBe('ticket_13')
        // The engine built in its own order all the same.
        expect(
            ofKind(records, 'ticket_worktree_created').map(
                ({ ticket }) => ticket
            )
        ).toEqual([11, 12, 13])
        expect(
            joinSteps(records).filter((step) => step.startsWith('joined'))
        ).toEqual([
            'joined #12 ok',
            'joined #11 clashed',
            'joined #11 ok',
            'joined #13 ok',
        ])
    }, 120_000)
})
