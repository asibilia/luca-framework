import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll } from 'bun:test'
import omit from 'lodash/omit'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { createPracticeRepo } from '../testing/practice-repo'

/**
 * Helpers shared by the guard tests (`agent-guards.e2e.test.ts` and the
 * `agent-guards-*.e2e.test.ts` files beside it): reading what a practice run
 * left in its journal and branch, and building one run to share between a
 * describe's tests.
 */

export type Practice = Awaited<ReturnType<typeof createPracticeRepo>>
export type Ran = Awaited<ReturnType<Practice['run']>>

/**
 * Each failed turn's content, without `session_gone` (#521) or `out_of_turns`
 * (#543): no guard test follows up a gone session or reaches a turn limit.
 */
export const failures = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'agent_failed'
            ? [omit(record.content, 'session_gone', 'out_of_turns')]
            : []
    )

export const commits = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'commit_made'
            ? [{ stage: record.content.stage, files: record.content.files }]
            : []
    )

export const created = (records: JournalRecord[]) => {
    const found = records.find(
        (record) => record.kind === 'ticket_worktree_created'
    )
    if (found?.kind !== 'ticket_worktree_created') throw new Error('none')
    return found.content
}

/**
 * The ticket's branch. A run that opens its PR removes the worktree, so its
 * files are read from the branch, which stays.
 */
export const ticketBranch = (records: JournalRecord[]): string =>
    created(records).branch

export const CLEAN_COMMITS: { stage: 'red' | 'green'; files: string[] }[] = [
    { stage: 'red', files: ['src/sum.test.ts'] },
    { stage: 'green', files: ['src/index.ts', 'src/sum.ts'] },
]

/**
 * Builds one practice run with these turns before the describe's tests, and
 * removes its folder after them. The tests only read what it left.
 */
export const shareRun = (turns: (repo: string) => ScriptedTurn[]) => {
    const shared: { root: string; practice?: Practice; ran?: Ran } = {
        root: '',
    }
    beforeAll(async () => {
        shared.root = await mkdtemp(join(tmpdir(), 'luca-engine-guards-'))
        shared.practice = await createPracticeRepo({ root: shared.root })
        shared.ran = await shared.practice.run({
            turns: turns(shared.practice.repo),
        })
    }, 120_000)
    afterAll(async () => {
        await rm(shared.root, { recursive: true, force: true })
    })
    return (): Ran & { repo: string } => {
        if (shared.practice === undefined || shared.ran === undefined) {
            throw new Error('The shared run was not built.')
        }
        return { ...shared.ran, repo: shared.practice.repo }
    }
}
