import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { type Practice, failures, commits } from './agent-guards-helpers'

import { AgentSessionSchema } from '../agents/agent-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { ticketIssue } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    git,
    happyTurns,
    SUM_TEST,
} from '../testing/practice-repo'

/**
 * Seam 2, the guards: one practice ticket, end to end, with scripted agents
 * that break their role's rules. The after-turn check, the failed tries, the
 * engine retries, and the stop are all the engine's own, so they hold for
 * every launcher.
 *
 * This file holds the tests that each build a practice run of their own. The
 * helpers are in `agent-guards-helpers.ts`; the other topics are in the
 * `agent-guards-*.e2e.test.ts` files beside this one.
 */

const kinds = (records: JournalRecord[]) => records.map(({ kind }) => kind)

describe('runs of their own', () => {
    let root = ''
    let practice: Practice

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-engine-guards-'))
        practice = await createPracticeRepo({ root })
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test("a refactor ticket's implementer may follow a rename into a test file", async () => {
        await Bun.write(
            join(practice.repo, 'src/sum.ts'),
            'export const total = ({ numbers }: { numbers: number[] }): number =>\n    numbers.reduce((sum, each) => sum + each, 0)\n'
        )
        await Bun.write(
            join(practice.repo, 'src/sum.test.ts'),
            SUM_TEST.replaceAll('sum(', 'total(').replace(
                "import { sum } from './sum'",
                "import { total } from './sum'"
            )
        )
        await Bun.write(
            join(practice.repo, 'src/index.ts'),
            "export { total } from './sum'\n"
        )
        await git(practice.repo, 'add', '-A')
        await git(practice.repo, 'commit', '-q', '-m', 'total')
        await git(practice.repo, 'push', '-q', 'origin', 'main')
        const { implementer, reviewer } = happyTurns()

        const { action, records, launches } = await practice.run({
            ticket: ticketIssue({
                number: 11,
                title: 'Rename total to sum',
                labels: ['ready-for-agent', 'refactor'],
                criteria: ['total is called sum'],
            }),
            turns: [
                {
                    ...implementer,
                    files: {
                        ...implementer.files,
                        'src/sum.test.ts': SUM_TEST,
                    },
                },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(launches[0]).toMatchObject({
            role: 'implementer',
            may_edit_tests: true,
        })
        expect(failures(records)).toEqual([])
        expect(commits(records)).toEqual([
            {
                stage: 'green',
                files: ['src/index.ts', 'src/sum.test.ts', 'src/sum.ts'],
            },
        ])
    }, 60_000)

    test('an engine failure starts a fresh agent without using up a try, and the ticket still completes', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const session = AgentSessionSchema.parse({
            session_id: 'session-1',
            model: 'claude-opus-5-5',
            api_key_source: 'none',
        })
        const { action, records, launches } = await practice.run({
            turns: [
                {
                    role: 'test-writer',
                    ticket: 11,
                    failure: 'engine',
                    error: 'The Claude Code process exited with code 1.',
                    session,
                },
                testWriter,
                implementer,
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(failures(records)).toEqual([
            {
                role: 'test-writer',
                failure: 'engine',
                error: 'The Claude Code process exited with code 1.',
                session_id: 'scripted-test-writer-11-1',
            },
        ])
        expect(
            launches.map(({ kind, role }) => `${kind}:${role}`).slice(0, 2)
        ).toEqual(['launch:test-writer', 'launch:test-writer'])
        expect(kinds(records).slice(9, 14)).toEqual([
            'agent_started',
            'agent_session',
            'agent_failed',
            'agent_started',
            'agent_finished',
        ])
        const sessions = records.flatMap((record) =>
            record.kind === 'agent_session' ? [record.content] : []
        )
        expect(sessions).toEqual([{ role: 'test-writer', session }])
    }, 60_000)

    test('a stop journals run_stopped and ends the run with an error', async () => {
        const { implementer, reviewer } = happyTurns()
        const reason = 'rate_limit_event status=rejected (five_hour)'

        await expect(
            practice.run({
                turns: [
                    {
                        role: 'test-writer',
                        ticket: 11,
                        failure: 'stop',
                        error: reason,
                    },
                    implementer,
                    reviewer,
                ],
            })
        ).rejects.toThrow(`Run stopped: ${reason}`)

        const records = practice.journal.read()
        expect(records.at(-1)).toMatchObject({
            kind: 'run_stopped',
            ticket: 11,
            content: { reason, role: 'test-writer' },
        })
        expect(failures(records)).toEqual([])
    }, 60_000)
})
