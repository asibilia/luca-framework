import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
    createPracticeRepo,
    happyTurns,
    PRACTICE_ENGINE_CONFIG,
    SUM_TEST,
} from '../testing/practice-repo'
import { ADDING_TESTS_SWIFT } from '../testing/swift-junit-fixtures'

/**
 * A ticket's own slow tests (#564) in a repo with a `junit` test command
 * (#668), end to end on the practice repo: the red check's own-files run
 * takes only the files bun can run, never a `.swift` test file.
 */

const FAST_TEST = "bun test --path-ignore-patterns='**/*.e2e.test.ts'"
const SLOW_FILE = 'src/sum.e2e.test.ts'
const SWIFT_FILE = 'Tests/CalcTests/AddingTests.swift'

/** Loads, and fails until `sum` is exported from the entry point. */
const FAILING_SLOW_TEST = `import { expect, test } from 'bun:test'

import * as api from './index'

test('sum is exported', () => {
    expect('sum' in api).toBe(true)
})
`

const JUNIT_CONFIG = {
    ...PRACTICE_ENGINE_CONFIG,
    checks: {
        ...PRACTICE_ENGINE_CONFIG.checks,
        test: [
            FAST_TEST,
            {
                run: 'sh scripts/junit.sh',
                results: 'junit',
                junit_path: 'out/core.xml',
            },
        ],
        slow_test: 'bun test .e2e.test',
    },
    test_file_patterns: ['src/**/*.test.ts', 'Tests/**/*.swift'],
}

describe("a ticket's own slow tests with a junit command, end to end", () => {
    test("the red check's own-files run never passes a .swift test file to bun test", async () => {
        const root = await mkdtemp(join(tmpdir(), 'luca-engine-junit-own-'))
        try {
            const practice = await createPracticeRepo({
                root,
                config: JUNIT_CONFIG,
                files: {
                    '.gitignore': 'node_modules\nout/\n',
                    // A stand-in for swift test: a JUnit file with no cases.
                    'scripts/junit.sh':
                        "mkdir -p out\nprintf '<testsuites></testsuites>' > out/core.xml\n",
                },
            })
            const { testWriter } = happyTurns()
            const { records } = await practice.run({
                turns: [
                    {
                        ...testWriter,
                        files: {
                            'src/sum.test.ts': SUM_TEST,
                            [SLOW_FILE]: FAILING_SLOW_TEST,
                            [SWIFT_FILE]: ADDING_TESTS_SWIFT,
                        },
                        result: {
                            outcome: 'tests_written',
                            criteria: [
                                {
                                    criterion_id: 'AC1',
                                    tests: [
                                        {
                                            file: SWIFT_FILE,
                                            name: 'AddingTests > addsTwoNumbers()',
                                        },
                                        {
                                            file: SLOW_FILE,
                                            name: 'sum is exported',
                                        },
                                    ],
                                },
                                {
                                    criterion_id: 'AC2',
                                    tests: [
                                        {
                                            file: 'src/sum.test.ts',
                                            name: 'sum > of no numbers is zero',
                                        },
                                    ],
                                },
                            ],
                            summary: 'One test per criterion.',
                            assumptions: [],
                            run_notes: [],
                        },
                    },
                ],
            })

            const [red] = records.flatMap((record) =>
                record.kind === 'red_check' ? [record.content] : []
            )
            expect(red).toBeDefined()
            // The own-files run went, for the changed slow file.
            expect(red?.tests.command).toContain(`'./${SLOW_FILE}'`)
            expect(red?.tests.command).not.toContain('.swift')
            expect(red?.tests.files_without_results).not.toContain(SWIFT_FILE)
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    }, 120_000)
})
