import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { EMPTY_TEST_REASON } from './decide-build'

import { createScriptedLauncher } from '../agents/scripted-launcher'
import {
    CLEAN_LENS_TURNS,
    git,
    HAPPY_TURNS,
    IMPLEMENTER_RESULT,
    runPractice,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'

/**
 * Seam 2: one ticket, end to end, on the practice repo
 * (`testing/practice-repo.ts`), the fix loops: a failed gate, a bad-test
 * bounce, and a mapped test that checks nothing (#581). The happy run is in
 * `run-one-ticket.e2e.test.ts`.
 */

/** A sum test that defines sum itself, so it passes before any code exists. */
const PASSING_SUM_TEST = SUM_TEST.replace(
    "import { sum } from './sum'",
    'const sum = ({ numbers }: { numbers: number[] }) =>\n    numbers.reduce((a, b) => a + b, 0)'
)

/** A sum test that fails now (sum is missing) but runs no expect(), so it checks nothing (#581). */
const EMPTY_SUM_TEST = `import { describe, test } from 'bun:test'

import { sum } from './sum'

describe('sum', () => {
    test('adds two numbers', () => {
        sum({ numbers: [1, 2] })
    })

    test('of no numbers is zero', () => {
        sum({ numbers: [] })
    })
})
`

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-e2e-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('one ticket, end to end, with scripted agents', () => {
    test('fix loops and a bad-test bounce still end in one PR', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const launcher = createScriptedLauncher({
            turns: [
                // 1. The first test-writer's test passes already: red check fails.
                {
                    ...testWriter,
                    files: { 'src/sum.test.ts': PASSING_SUM_TEST },
                },
                // 2. Its follow-up fixes that, but expects 1 + 2 to be 4.
                {
                    ...testWriter,
                    files: {
                        'src/sum.test.ts': SUM_TEST.replace(
                            'toBe(3)',
                            'toBe(4)'
                        ),
                    },
                },
                // 3. The implementer writes some code, then calls that test bad.
                {
                    role: 'implementer',
                    ticket: 11,
                    files: {
                        'src/sum.ts': SUM,
                        'src/half-done.ts': 'export const half = 1\n',
                        'README.md': '# Changed by the implementer\n',
                    },
                    result: {
                        ...IMPLEMENTER_RESULT,
                        outcome: 'bad_test',
                        bad_test: {
                            file: 'src/sum.test.ts',
                            name: 'sum > adds two numbers',
                            reason: '1 + 2 is 3, not 4.',
                        },
                    },
                },
                // 4. A fresh test-writer replaces the bad test.
                {
                    ...testWriter,
                    files: { 'src/sum.test.ts': SUM_TEST },
                    result: {
                        ...TEST_WRITER_RESULT,
                        assumptions: ['1 + 2 is 3.'],
                    },
                },
                // 5. A fresh implementer leaves a console.log: lint fails.
                {
                    ...implementer,
                    files: {
                        'src/sum.ts': `${SUM}console.log('sum loaded')\n`,
                        'src/index.ts': "export { sum } from './sum'\n",
                    },
                },
                // 6. Its follow-up removes it.
                { ...implementer, files: { 'src/sum.ts': SUM } },
                reviewer,
                ...CLEAN_LENS_TURNS(10),
            ],
        })
        const { action, tracker, records, origin } = await runPractice({
            root,
            turns: [],
            launcher,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // Follow-ups went to the same session; fresh agents got new ones.
        // (The final review's five lenses come after, as spec #10's.)
        const calls = launcher.launches().filter(({ ticket }) => ticket === 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'follow_up test-writer',
            'launch implementer',
            'launch test-writer',
            'launch implementer',
            'follow_up implementer',
            'launch ticket-reviewer',
        ])
        const [tw1, twFix, impl1, tw2, impl2, implFix] = calls
        expect(twFix?.session_id).toBe(tw1?.session_id ?? '')
        expect(implFix?.session_id).toBe(impl2?.session_id ?? '')
        expect(tw2?.session_id).not.toBe(tw1?.session_id ?? '')
        expect(impl2?.session_id).not.toBe(impl1?.session_id ?? '')
        expect(twFix?.prompt).toContain('passes already')
        expect(tw2?.prompt).toContain('1 + 2 is 3, not 4.')
        expect(implFix?.prompt).toContain('no console.log')
        expect(calls.map(({ may_edit_tests }) => may_edit_tests)).toEqual([
            true,
            undefined,
            false,
            true,
            false,
            undefined,
            false,
        ])

        // The journal names the session each follow-up went to.
        const followUps = records.flatMap((record) =>
            record.kind === 'agent_started' && record.content.follow_up_of
                ? [record.content.follow_up_of]
                : []
        )
        expect(followUps).toEqual([
            tw1?.session_id ?? '',
            impl2?.session_id ?? '',
        ])
        expect(
            records.filter((record) => record.kind === 'worktree_reset')
        ).toHaveLength(1)

        // Two red commits (the second replaces the bad test), then green.
        // The implementer's first, thrown-away work is in none of them.
        const commits = records.flatMap((record) =>
            record.kind === 'commit_made'
                ? [
                      {
                          message: record.content.message,
                          files: record.content.files,
                      },
                  ]
                : []
        )
        expect(commits).toEqual([
            {
                message: 'test: add failing tests for #11 Add sum',
                files: ['src/sum.test.ts'],
            },
            {
                message: 'test: replace a bad test for #11 Add sum',
                files: ['src/sum.test.ts'],
            },
            {
                message: 'feat: build #11 Add sum',
                files: ['src/index.ts', 'src/sum.ts'],
            },
        ])
        const branch = tracker.pullRequests()[0]?.head ?? ''
        const pushedLog = await git(origin, 'log', '--format=%s', branch)
        expect(pushedLog.trim().split('\n')).toEqual([
            'feat: build #11 Add sum',
            'test: replace a bad test for #11 Add sum',
            'test: add failing tests for #11 Add sum',
            'initial',
        ])
        expect(await git(origin, 'show', `${branch}:README.md`)).toBe(
            '# Practice\n'
        )

        // The PR keeps the assumptions from both test-writers.
        const body = tracker.pullRequests()[0]?.body ?? ''
        expect(body).toContain('- #11: sum takes a list of numbers.')
        expect(body).toContain('- #11: 1 + 2 is 3.')
    }, 90_000)

    test('a mapped test that runs no expect() goes back to a fresh test-writer, and the run still ends in one PR (#581)', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const launcher = createScriptedLauncher({
            turns: [
                // 1. The test-writer's tests fail now (no sum yet), but check nothing.
                { ...testWriter, files: { 'src/sum.test.ts': EMPTY_SUM_TEST } },
                // 2. The implementer's code makes them pass: with no expect().
                implementer,
                // 3. A fresh test-writer, told the engine found them empty, replaces them.
                { ...testWriter, files: { 'src/sum.test.ts': SUM_TEST } },
                // 4. A fresh implementer writes the code again.
                implementer,
                reviewer,
                ...CLEAN_LENS_TURNS(10),
            ],
        })
        const { action, tracker, records } = await runPractice({
            root,
            turns: [],
            launcher,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const calls = launcher.launches().filter(({ ticket }) => ticket === 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'launch implementer',
            'launch test-writer',
            'launch implementer',
            'launch ticket-reviewer',
        ])
        const [, , tw2] = calls
        expect(tw2?.prompt).toContain(
            'The engine found this test checks nothing'
        )
        expect(tw2?.prompt).toContain('src/sum.test.ts')
        expect(tw2?.prompt).toContain('sum > adds two numbers')

        // The reset names the test and why; the gates before it saw no
        // expect(), and the gates after it saw one in each test.
        const [reset, ...more] = records.filter(
            (record) => record.kind === 'worktree_reset'
        )
        expect(more).toHaveLength(0)
        expect(reset?.content).toMatchObject({
            bad_test: {
                file: 'src/sum.test.ts',
                name: 'sum > adds two numbers',
                reason: EMPTY_TEST_REASON,
            },
        })
        const counts = records.flatMap((record) =>
            record.kind === 'gates_run' && record.content.target === 'ticket'
                ? [record.content.cases?.map(({ assertions }) => assertions)]
                : []
        )
        expect(counts).toEqual([
            [0, 0],
            [1, 1],
        ])

        // The new tests get their own red commit, which says a bad test was replaced.
        const messages = records.flatMap((record) =>
            record.kind === 'commit_made' ? [record.content.message] : []
        )
        expect(messages).toEqual([
            'test: add failing tests for #11 Add sum',
            'test: replace a bad test for #11 Add sum',
            'feat: build #11 Add sum',
        ])
        expect(tracker.pullRequests()).toHaveLength(1)
    }, 90_000)
})
