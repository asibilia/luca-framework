import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { AgentSessionSchema } from '../agents/agent-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { rateLimitReading } from '../testing/build-fixtures'
import { createPracticeRepo, happyTurns } from '../testing/practice-repo'

/**
 * Seam 2 for the run's canonical ending (#706): the practice ticket, end to
 * end, opening its PR, and stopping on a launcher stop it can go on from.
 * The other terminal paths are in `run-ended.test.ts`.
 */

let root = ''
let practice: Awaited<ReturnType<typeof createPracticeRepo>>

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-run-ended-e2e-'))
    practice = await createPracticeRepo({ root })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const endings = (records: JournalRecord[]): JournalRecord[] =>
    records.filter(({ kind }) => kind === 'run_ended')

describe('run_ended, end to end', () => {
    test('a PR opening journals pull_request_opened, then one run_ended with its URL, and a rerun adds none', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practice.run({
            turns: [testWriter, implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const opened = records.find(
            ({ kind }) => kind === 'pull_request_opened'
        )
        const url =
            opened?.kind === 'pull_request_opened' ? opened.content.url : ''
        expect(url).not.toBe('')
        const ended = endings(records)
        expect(ended).toHaveLength(1)
        expect(ended[0]).toMatchObject({
            content: { outcome: 'pull_request', url },
        })
        expect(ended[0]?.seq ?? 0).toBeGreaterThan(opened?.seq ?? 0)

        const again = await practice.run({ turns: [], resume: true })
        expect(again.action).toMatchObject({ outcome: 'pr_opened' })
        expect(endings(again.records)).toHaveLength(1)
    }, 60_000)

    test('a launcher stop the run can go on from is no ending; the run that goes on ends once', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        await expect(
            practice.run({
                turns: [
                    {
                        role: 'test-writer',
                        ticket: 11,
                        failure: 'plan',
                        error: 'The plan said no.',
                        session: AgentSessionSchema.parse({
                            session_id: 'cut-1',
                            rate_limit_events: [
                                rateLimitReading({ status: 'allowed' }),
                            ],
                        }),
                    },
                ],
            })
        ).rejects.toThrow('Run stopped:')
        expect(practice.journal.read().at(-1)).toMatchObject({
            kind: 'run_stopped',
            content: { billing: false, crashed: false },
        })
        expect(endings(practice.journal.read())).toEqual([])

        const { action, records } = await practice.run({
            turns: [testWriter, implementer, reviewer],
            resume: true,
        })
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(endings(records)).toEqual([
            expect.objectContaining({
                content: expect.objectContaining({ outcome: 'pull_request' }),
            }),
        ])
    }, 60_000)
})
