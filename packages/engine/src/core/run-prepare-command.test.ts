import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    happyTurns,
    latestStuck,
    PRACTICE_ENGINE_CONFIG,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from '../testing/practice-repo'

/**
 * Seam 2: a prepare command (#481), end to end on the practice repo. Its
 * tests need files that only its build makes, in a gitignored `gen/`
 * folder, as HeartGold's need a generated header and the linker map. The
 * engine runs the config's `prepare` command before every test run in a
 * checkout, so the build outputs are there and follow the latest code.
 */

const PREPARE_COMMAND = 'bun scripts/prepare.ts'

/**
 * The practice repo's "build": lists every source file in `gen/files.json`
 * and every `export const` of the non-test sources in `gen/exports.json`.
 * A source file with `BREAK_THE_BUILD` in it breaks it.
 */
const PREPARE_SCRIPT = `const files = []
for await (const file of new Bun.Glob('src/**/*.ts').scan('.')) files.push(file)
files.sort()
const names = []
for (const file of files) {
    if (file.endsWith('.test.ts')) continue
    const text = await Bun.file(file).text()
    if (text.includes('BREAK_THE_BUILD')) {
        console.error('prepare: ' + file + ' breaks the build')
        process.exit(1)
    }
    for (const match of text.matchAll(/export const (\\w+)/g)) names.push(match[1])
}
names.sort()
await Bun.write('gen/files.json', JSON.stringify(files))
await Bun.write('gen/exports.json', JSON.stringify(names))
`

/**
 * An old test that needs the build's output, and that it is up to date:
 * it passes only when `gen/files.json` lists the source files there are now.
 */
const BUILD_TEST = `import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

describe('the build', () => {
    test('lists every source file', async () => {
        const root = join(import.meta.dir, '..')
        const listed = await Bun.file(join(root, 'gen', 'files.json')).json()
        const files: string[] = []
        for await (const file of new Bun.Glob('src/**/*.ts').scan(root)) {
            files.push(file)
        }
        expect(listed).toEqual(files.sort())
    })
})
`

/** The practice repo's files: the build, its ignored output, its old test. */
const PREPARE_FILES = {
    '.gitignore': 'node_modules\ngen\n',
    'scripts/prepare.ts': PREPARE_SCRIPT,
    'src/build.test.ts': BUILD_TEST,
}

const PREPARE_CONFIG = { ...PRACTICE_ENGINE_CONFIG, prepare: PREPARE_COMMAND }

/** The sum tests, plus one that needs the build to have seen `sum`. */
const SUM_AND_MAP_TEST = `import { join } from 'node:path'

${SUM_TEST}
describe('the build map', () => {
    test('lists sum', async () => {
        const map = await Bun.file(
            join(import.meta.dir, '..', 'gen', 'exports.json')
        ).json()
        expect(map).toContain('sum')
    })
})
`

const MAP_TEST_WRITER_RESULT = {
    ...TEST_WRITER_RESULT,
    criteria: [
        ...TEST_WRITER_RESULT.criteria.filter(
            ({ criterion_id }) => criterion_id !== 'AC2'
        ),
        {
            criterion_id: 'AC2',
            tests: [
                {
                    file: 'src/sum.test.ts',
                    name: 'sum > of no numbers is zero',
                },
                { file: 'src/sum.test.ts', name: 'the build map > lists sum' },
            ],
        },
    ],
}

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-prepare-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const byKind = <K extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: K
) =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: K }> =>
            record.kind === kind
    )

/** The happy turns, with the test-writer's tests needing the build map. */
const prepareTurns = () => {
    const { testWriter, implementer, reviewer } = happyTurns()
    return {
        testWriter: {
            ...testWriter,
            files: { 'src/sum.test.ts': SUM_AND_MAP_TEST },
            result: MAP_TEST_WRITER_RESULT,
        },
        implementer,
        reviewer,
    }
}

describe('a prepare command, end to end', () => {
    test('a repo whose tests need the ignored output of its prepare command passes its baseline, red check, and gates, and joins', async () => {
        const practice = await createPracticeRepo({
            root,
            config: PREPARE_CONFIG,
            files: PREPARE_FILES,
        })
        const { testWriter, implementer, reviewer } = prepareTurns()

        const { action, records } = await practice.run({
            turns: [testWriter, implementer, reviewer],
        })

        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The old test found the build's output before any agent worked.
        const [baseline] = byKind(records, 'baseline_tests')
        expect(baseline?.content.ok).toBe(true)
        expect(
            baseline?.content.cases.map(({ full_name, status }) => ({
                full_name,
                status,
            }))
        ).toEqual([
            {
                full_name: 'the build > lists every source file',
                status: 'passed',
            },
        ])

        // The red check saw the build list the test-writer's new file.
        const [red] = byKind(records, 'red_check')
        expect(red?.content).toMatchObject({ ok: true, problems: [] })

        // The ticket's gates and the run branch's gates after the join passed.
        const gates = byKind(records, 'gates_run').map(({ content }) => content)
        expect(gates.map(({ target, ok }) => ({ target, ok }))).toEqual([
            { target: 'ticket', ok: true },
            { target: 'run_branch', ok: true },
        ])
        expect(records.some((record) => record.kind === 'ticket_joined')).toBe(
            true
        )
    }, 90_000)

    test('the prepare command runs again before every later test run, so its output follows the latest code', async () => {
        const practice = await createPracticeRepo({
            root,
            config: PREPARE_CONFIG,
            files: PREPARE_FILES,
        })
        const { testWriter, implementer, reviewer } = prepareTurns()
        // First try: the code exports `total`, not `sum`.
        const namesItTotal: ScriptedTurn = {
            ...implementer,
            files: {
                'src/sum.ts': SUM.replace(
                    'export const sum',
                    'export const total'
                ),
                'src/index.ts': "export { total } from './sum'\n",
            },
        }
        // The fix renames it to `sum`: the build map must follow.
        const renamesIt: ScriptedTurn = {
            ...implementer,
            files: {
                'src/sum.ts': SUM,
                'src/index.ts': "export { sum } from './sum'\n",
            },
        }

        const { action, records, launches } = await practice.run({
            turns: [testWriter, namesItTotal, renamesIt, reviewer],
        })

        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        const [red] = byKind(records, 'red_check')
        expect(red?.content).toMatchObject({ ok: true, problems: [] })

        // The first gates failed on the code; the re-check after the fix
        // saw a build map with `sum` in it, and so did the run branch.
        const gates = byKind(records, 'gates_run').map(({ content }) => content)
        expect(gates.map(({ target, ok }) => ({ target, ok }))).toEqual([
            { target: 'ticket', ok: false },
            { target: 'ticket', ok: true },
            { target: 'run_branch', ok: true },
        ])
        const calls = launches.filter(({ ticket }) => ticket === 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'launch implementer',
            'follow_up implementer',
            'launch ticket-reviewer',
        ])
    }, 90_000)

    test('a prepare command that fails after an implementer turn goes back to the implementer with its output', async () => {
        const practice = await createPracticeRepo({
            root,
            config: PREPARE_CONFIG,
            files: PREPARE_FILES,
        })
        const { testWriter, implementer, reviewer } = prepareTurns()
        const breaksTheBuild: ScriptedTurn = {
            ...implementer,
            files: {
                ...implementer.files,
                'src/sum.ts': `${SUM}// BREAK_THE_BUILD\n`,
            },
        }
        const fixesTheBuild: ScriptedTurn = {
            ...implementer,
            files: { 'src/sum.ts': SUM },
        }

        const { action, records, launches } = await practice.run({
            turns: [testWriter, breaksTheBuild, fixesTheBuild, reviewer],
        })

        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The failed build went to the same implementer, with its output.
        const calls = launches.filter(({ ticket }) => ticket === 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'launch implementer',
            'follow_up implementer',
            'launch ticket-reviewer',
        ])
        expect(calls[2]?.session_id).toBe(calls[1]?.session_id ?? '')
        expect(calls[2]?.prompt).toContain('src/sum.ts breaks the build')

        // The green commit holds the fixed code.
        const green = byKind(records, 'commit_made').find(
            ({ content }) => content.stage === 'green'
        )
        expect(green?.content.files).toEqual(['src/index.ts', 'src/sum.ts'])
    }, 90_000)

    test('a prepare command that fails before any agent has worked makes the ticket stuck, with its output as the reason', async () => {
        const practice = await createPracticeRepo({
            root,
            config: {
                ...PRACTICE_ENGINE_CONFIG,
                prepare: 'bun scripts/no-toolchain.ts',
            },
            files: {
                ...PREPARE_FILES,
                'scripts/no-toolchain.ts':
                    "console.error('gmake: command not found')\nprocess.exit(127)\n",
            },
        })
        const { testWriter, implementer, reviewer } = prepareTurns()

        const { action, records } = await practice.run({
            turns: [testWriter, implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'wait_for_reply' })
        const stuck = latestStuck(records)
        expect(stuck?.ticket).toBe(11)
        expect(stuck?.detail).toContain('gmake: command not found')
        expect(records.some((record) => record.kind === 'agent_started')).toBe(
            false
        )
        expect(records.some((record) => record.kind === 'gates_run')).toBe(
            false
        )
    }, 90_000)

    test('the test-writer and implementer prompts name the prepare command', async () => {
        const practice = await createPracticeRepo({
            root,
            config: PREPARE_CONFIG,
            files: PREPARE_FILES,
        })
        const { testWriter, implementer, reviewer } = prepareTurns()

        const { action, launches } = await practice.run({
            turns: [testWriter, implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const prompts = launches.filter(({ ticket }) => ticket === 11)
        const testWriterPrompt = prompts.find(
            ({ role }) => role === 'test-writer'
        )?.prompt
        const implementerPrompt = prompts.find(
            ({ role }) => role === 'implementer'
        )?.prompt
        expect(testWriterPrompt).toContain(PREPARE_COMMAND)
        expect(implementerPrompt).toContain(PREPARE_COMMAND)
    }, 90_000)
})
