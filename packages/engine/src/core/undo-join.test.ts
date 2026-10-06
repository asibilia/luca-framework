import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { executeBuildAction } from './execute-build'

import type { AgentLauncher } from '../agents/agent-launcher'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal, type Journal } from '../journal/journal'
import type { JournalEntry } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    gatesRun,
    intakePassed,
    practiceTicket,
    pushed,
    ticketStuck,
    RUN_BRANCH,
} from '../testing/build-fixtures'
import { git } from '../testing/practice-repo'
import type { Tracker } from '../tracker/tracker'

/**
 * The engine's `undo_join` step on a real run branch (#519): it takes off
 * the stuck ticket's join and any later join not pushed yet, and never
 * rewinds the run branch over other work. A refused undo leaves the run
 * branch alone and the ticket stuck (`undo_refused`).
 */

let root = ''
let repo = ''
let journal: Journal

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-undo-join-'))
    repo = join(root, 'repo')
    await mkdir(repo, { recursive: true })
    await git(repo, 'init', '-q', '-b', 'main')
    await git(repo, 'config', 'user.email', 'luca@example.com')
    await git(repo, 'config', 'user.name', 'Luca')
    await commitFile({ name: 'base.ts' })
    journal = createJournal({ file: join(root, 'run-1', 'journal.jsonl') })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** Commits one new file on the run branch and returns the commit's sha. */
const commitFile = async ({ name }: { name: string }): Promise<string> => {
    await Bun.write(join(repo, name), `export const name = '${name}'\n`)
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', name)
    return headOf()
}

const headOf = async (): Promise<string> =>
    (await git(repo, 'rev-parse', 'HEAD')).trim()

const joinedWith = ({
    ticket,
    shas,
}: {
    ticket: number
    shas: string[]
}): JournalEntry => ({
    kind: 'ticket_joined',
    ticket,
    role: null,
    content: { ok: true, shas },
})

/** The run so far, with the repo as the run branch's checkout. */
const journalOf = async (entries: JournalEntry[]) => {
    const tickets = [
        practiceTicket({ number: 11, title: 'Add sum' }),
        practiceTicket({ number: 12, title: 'Add product' }),
    ]
    for (const entry of [
        ...intakePassed({ tickets }),
        {
            kind: 'run_branch_created',
            ticket: null,
            role: null,
            content: { branch: RUN_BRANCH, path: repo, base_sha: 'b0' },
        } satisfies JournalEntry,
        ...entries,
    ]) {
        journal.append(entry)
    }
}

const undoJoin = (first_sha: string) =>
    executeBuildAction({
        action: { type: 'undo_join', ticket: 11, first_sha },
        journal,
        tracker: {} as Tracker,
        git: createGitAdapter({ repo_root: repo }),
        launcher: { closeSession: async () => {} } as unknown as AgentLauncher,
    })

describe('undo_join', () => {
    test("takes a later join not pushed yet with it, and clears that ticket's join too", async () => {
        const base = await headOf()
        const sum = await commitFile({ name: 'sum.ts' })
        const product = await commitFile({ name: 'product.ts' })
        await journalOf([
            joinedWith({ ticket: 11, shas: [sum] }),
            gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ticketStuck({ ticket: 11, reason: 'join_gates_failed' }),
            joinedWith({ ticket: 12, shas: [product] }),
        ])

        await undoJoin(sum)

        expect(await headOf()).toBe(base)
        const records = journal.read()
        expect(records.at(-1)).toMatchObject({
            kind: 'join_undone',
            ticket: 11,
            content: { shas: [sum, product] },
        })
        const state = replayRun({ records })
        expect(state.tickets[11]?.joined).toBeNull()
        expect(state.tickets[12]?.joined).toBeNull()
    })

    test('refuses to undo over a pushed join: the run branch is left alone and the ticket is stuck', async () => {
        const sum = await commitFile({ name: 'sum.ts' })
        const product = await commitFile({ name: 'product.ts' })
        await journalOf([
            joinedWith({ ticket: 11, shas: [sum] }),
            gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ticketStuck({ ticket: 11, reason: 'join_gates_failed' }),
            joinedWith({ ticket: 12, shas: [product] }),
            gatesRun({ ticket: 12, target: 'run_branch', ok: true }),
            pushed({ ticket: 12, sha: product }),
        ])

        await undoJoin(sum)

        expect(await headOf()).toBe(product)
        const records = journal.read()
        expect(records.some(({ kind }) => kind === 'join_undone')).toBe(false)
        const last = records.at(-1)
        expect(last).toMatchObject({
            kind: 'ticket_stuck',
            ticket: 11,
            content: { reason: 'undo_refused' },
        })
        expect(
            last?.kind === 'ticket_stuck' ? last.content.detail : ''
        ).toContain(product.slice(0, 7))
    })

    test('refuses a join no longer on the run branch, so it never rewinds onto an older join', async () => {
        // #11's undo took #12's join with it, then another join landed.
        const sum = await commitFile({ name: 'sum.ts' })
        const product = await commitFile({ name: 'product.ts' })
        await git(repo, 'reset', '-q', '--hard', `${sum}^`)
        const average = await commitFile({ name: 'average.ts' })
        await journalOf([
            joinedWith({ ticket: 11, shas: [product] }),
            gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ticketStuck({ ticket: 11, reason: 'join_gates_failed' }),
        ])

        await undoJoin(product)

        expect(await headOf()).toBe(average)
        expect(journal.read().at(-1)).toMatchObject({
            kind: 'ticket_stuck',
            ticket: 11,
            content: { reason: 'undo_refused' },
        })
    })
})
