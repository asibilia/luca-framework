import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    git,
    HAPPY_TURNS,
    latestStuck,
    runPractice,
} from '../testing/practice-repo'

/**
 * Seam 2: one ticket, end to end, on the practice repo
 * (`testing/practice-repo.ts`), the dependency installs: the engine installs
 * a ticket's new package, and a repo's dependencies in every new worktree.
 * The happy run is in `run-one-ticket.e2e.test.ts`.
 */

/**
 * A repo with a local workspace package that nothing depends on yet. Bun
 * installs workspace packages offline, and auto-install is off, so nothing
 * here reaches the network.
 */
const WORKSPACE_FILES = {
    'package.json': JSON.stringify(
        { name: 'practice', private: true, workspaces: ['packages/*'] },
        null,
        4
    ),
    'bunfig.toml': '[install]\nauto = "disable"\n',
    'packages/math/package.json': JSON.stringify(
        { name: '@practice/math', version: '1.0.0', main: 'index.ts' },
        null,
        4
    ),
    'packages/math/index.ts':
        'export const add = (a: number, b: number): number => a + b\n',
}

/** The implementer adds the workspace package as a dependency and uses it. */
const MANIFEST_WITH_DEPENDENCY = JSON.stringify(
    {
        name: 'practice',
        private: true,
        workspaces: ['packages/*'],
        dependencies: { '@practice/math': 'workspace:*' },
    },
    null,
    4
)

const SUM_WITH_DEPENDENCY = `import { add } from '@practice/math'

export const sum = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce(add, 0)
`

/**
 * A repo that already depends on its workspace package and uses it, with a
 * lockfile to match. A fresh worktree has no `node_modules`, so its tests
 * and its build only pass after the engine's install.
 */
const DEPENDENT_FILES = {
    ...WORKSPACE_FILES,
    'package.json': MANIFEST_WITH_DEPENDENCY,
    'src/add-one.ts': `import { add } from '@practice/math'

export const addOne = (n: number): number => add(n, 1)
`,
    'src/add-one.test.ts': `import { expect, test } from 'bun:test'

import { addOne } from './add-one'

test('addOne adds one', () => {
    expect(addOne(1)).toBe(2)
})
`,
    'src/index.ts': "export { addOne } from './add-one'\n",
}

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-e2e-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('one ticket, end to end, with scripted agents', () => {
    test('a ticket that adds a package gets the install from the engine, and the lockfile in its green commit', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const { action, records, origin } = await runPractice({
            root,
            files: WORKSPACE_FILES,
            turns: [
                testWriter,
                {
                    ...implementer,
                    files: {
                        'package.json': MANIFEST_WITH_DEPENDENCY,
                        'src/sum.ts': SUM_WITH_DEPENDENCY,
                        'src/index.ts': "export { sum } from './sum'\n",
                    },
                },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // Agents are told the engine runs the install, not them.
        const implementerStart = records.find(
            (record) =>
                record.kind === 'agent_started' &&
                record.content.role === 'implementer'
        )
        expect(
            implementerStart?.kind === 'agent_started'
                ? implementerStart.content.prompt
                : ''
        ).toContain('Never run the package install')

        // The engine ran the install before the other gates, on the ticket
        // and again on the joined run branch.
        const gates = records.flatMap((record) =>
            record.kind === 'gates_run' ? [record.content] : []
        )
        expect(gates.map(({ target, ok }) => ({ target, ok }))).toEqual([
            { target: 'ticket', ok: true },
            { target: 'run_branch', ok: true },
        ])
        for (const { checks } of gates) {
            expect(checks.map(({ name }) => name)).toEqual([
                'install',
                'test',
                'types',
                'lint',
            ])
        }

        // The green commit holds the updated lockfile next to the manifest.
        const commits = records.flatMap((record) =>
            record.kind === 'commit_made' ? [record.content] : []
        )
        expect(commits.map(({ stage, files }) => ({ stage, files }))).toEqual([
            { stage: 'red', files: ['src/sum.test.ts'] },
            {
                stage: 'green',
                files: [
                    'bun.lock',
                    'package.json',
                    'src/index.ts',
                    'src/sum.ts',
                ],
            },
        ])
        const branch = (await git(origin, 'branch', '--list', 'luca/*'))
            .trim()
            .replace(/^\* /, '')
        const lockfile = await git(origin, 'show', `${branch}:bun.lock`)
        expect(lockfile).toContain('"@practice/math": "workspace:*"')
        // The engine's own install is never blamed on an agent.
        expect(records.some((record) => record.kind === 'agent_failed')).toBe(
            false
        )
    }, 60_000)

    test('a failed install goes back to the implementer like any failed gate', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const fixedFiles = {
            'package.json': MANIFEST_WITH_DEPENDENCY,
            'src/sum.ts': SUM_WITH_DEPENDENCY,
            'src/index.ts': "export { sum } from './sum'\n",
        }
        const { action, records } = await runPractice({
            root,
            files: WORKSPACE_FILES,
            turns: [
                testWriter,
                // First try: a dependency on a package that doesn't exist.
                {
                    ...implementer,
                    files: {
                        ...fixedFiles,
                        'package.json': MANIFEST_WITH_DEPENDENCY.replace(
                            '@practice/math',
                            '@practice/missing'
                        ),
                    },
                },
                // Its follow-up names the right package.
                { ...implementer, files: fixedFiles },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The failed install stopped the gates; the next round passed.
        const ticketGates = records.flatMap((record) =>
            record.kind === 'gates_run' && record.content.target === 'ticket'
                ? [record.content]
                : []
        )
        expect(
            ticketGates.map(({ ok, checks }) => ({
                ok,
                names: checks.map(({ name }) => name),
            }))
        ).toEqual([
            { ok: false, names: ['install'] },
            { ok: true, names: ['install', 'test', 'types', 'lint'] },
        ])

        // The same implementer session got the install's output.
        const followUp = records.find(
            (record) =>
                record.kind === 'agent_started' &&
                record.content.follow_up_of !== null
        )
        expect(followUp?.role).toBe('implementer')
        expect(
            followUp?.kind === 'agent_started' ? followUp.content.prompt : ''
        ).toContain('install failed')

        const green = records.find(
            (record) =>
                record.kind === 'commit_made' &&
                record.content.stage === 'green'
        )
        expect(
            green?.kind === 'commit_made' ? green.content.files : []
        ).toContain('bun.lock')
        // What the engine's install left between turns is never blamed on
        // the implementer's follow-up.
        expect(records.some((record) => record.kind === 'agent_failed')).toBe(
            false
        )
    }, 60_000)

    test("the engine's install updating the lockfile between turns is not blamed on the implementer", async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const fixedFiles = {
            'package.json': MANIFEST_WITH_DEPENDENCY,
            'src/sum.ts': SUM_WITH_DEPENDENCY,
            'src/index.ts': "export { sum } from './sum'\n",
        }
        const { action, records } = await runPractice({
            root,
            files: WORKSPACE_FILES,
            turns: [
                testWriter,
                // First try: the install passes (and updates bun.lock), lint fails.
                {
                    ...implementer,
                    files: {
                        ...fixedFiles,
                        'src/sum.ts': `${SUM_WITH_DEPENDENCY}console.log('debug')\n`,
                    },
                },
                { ...implementer, files: fixedFiles },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const ticketGates = records.flatMap((record) =>
            record.kind === 'gates_run' && record.content.target === 'ticket'
                ? [record.content]
                : []
        )
        expect(
            ticketGates.map(({ checks }) =>
                checks.map(({ name, ok: passed }) => `${name}:${passed}`)
            )
        ).toEqual([
            ['install:true', 'test:true', 'types:true', 'lint:false'],
            ['install:true', 'test:true', 'types:true', 'lint:true'],
        ])
        expect(records.some((record) => record.kind === 'agent_failed')).toBe(
            false
        )
    }, 60_000)
    test('a repo that already has a dependency gets it installed in every new worktree, and its first gates pass', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const { action, records } = await runPractice({
            root,
            files: DEPENDENT_FILES,
            turns: [
                testWriter,
                {
                    ...implementer,
                    files: {
                        'src/sum.ts': SUM_WITH_DEPENDENCY,
                        'src/index.ts':
                            "export { addOne } from './add-one'\nexport { sum } from './sum'\n",
                    },
                },
                reviewer,
            ],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The engine installed from the lockfile, without changing it, in
        // the run branch's checkout and the ticket's worktree, before any
        // test, agent, or gate.
        const installs = records.flatMap((record) =>
            record.kind === 'dependencies_installed'
                ? [
                      {
                          target: record.content.target,
                          command: record.content.check?.command,
                          ok: record.content.check?.ok,
                      },
                  ]
                : []
        )
        expect(installs).toEqual([
            {
                target: 'run_branch',
                command: 'bun install --frozen-lockfile',
                ok: true,
            },
            {
                target: 'ticket',
                command: 'bun install --frozen-lockfile',
                ok: true,
            },
        ])
        const kinds = records.map(({ kind }) => kind)
        const ticketInstall = records.findIndex(
            (record) =>
                record.kind === 'dependencies_installed' &&
                record.content.target === 'ticket'
        )
        expect(ticketInstall).toBeLessThan(kinds.indexOf('baseline_tests'))
        expect(ticketInstall).toBeLessThan(kinds.indexOf('agent_started'))

        // The old test that uses the dependency passed before any agent.
        const baseline = records.find(
            (record) => record.kind === 'baseline_tests'
        )
        expect(
            baseline?.kind === 'baseline_tests' ? baseline.content.ok : false
        ).toBe(true)

        // The first gate run passed, with no install of its own: no
        // manifest changed.
        const gates = records.flatMap((record) =>
            record.kind === 'gates_run' ? [record.content] : []
        )
        expect(gates[0]).toMatchObject({ target: 'ticket', ok: true })
        expect(gates[0]?.checks.map(({ name }) => name)).toEqual([
            'test',
            'types',
            'lint',
        ])
        expect(records.some((record) => record.kind === 'agent_failed')).toBe(
            false
        )
    }, 60_000)

    test('an install that fails in a new worktree is journaled and makes the ticket stuck, before any agent', async () => {
        const { action, records } = await runPractice({
            root,
            files: WORKSPACE_FILES,
            // The committed manifest wants a workspace package that doesn't
            // exist, so the install fails, offline.
            stale_manifest: MANIFEST_WITH_DEPENDENCY.replace(
                '@practice/math',
                '@practice/missing'
            ),
            turns: HAPPY_TURNS,
        })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        expect(latestStuck(records)).toMatchObject({
            ticket: 11,
            reason: 'install_failed',
        })
        const failed = records.find(
            (record) => record.kind === 'dependencies_installed'
        )
        expect(
            failed?.kind === 'dependencies_installed'
                ? failed.content.check
                : null
        ).toMatchObject({
            name: 'install',
            command: 'bun install --frozen-lockfile',
            ok: false,
        })
        const stuck = records.find((record) => record.kind === 'ticket_stuck')
        expect(
            stuck?.kind === 'ticket_stuck' ? stuck.content.detail : ''
        ).toContain('bun install --frozen-lockfile')
        expect(records.some((record) => record.kind === 'agent_started')).toBe(
            false
        )
        expect(records.some((record) => record.kind === 'gates_run')).toBe(
            false
        )
    }, 60_000)
})
