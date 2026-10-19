import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
    createPracticeRepo,
    happyTurns,
    latestStuck,
} from '../testing/practice-repo'

/**
 * Moved tests are old tests (#609), end to end on the practice repo: its
 * lint refuses a test file over 16 lines, and its greet test file is over
 * that. The test-writer splits it into two files, deleting it, next to the
 * ticket's own new tests. The red check counts the moved tests as old ones
 * (noting them), and the ticket passes. The gates, commits, and PR are real.
 */

const MAX_TEST_LINES = 16

/** No console.log in src, and no test file over the line limit. */
const LINT_WITH_LIMIT = `const glob = new Bun.Glob('src/**/*.ts')
let bad = 0
for await (const file of glob.scan('.')) {
    const text = await Bun.file(file).text()
    if (text.includes('console.log')) {
        console.error(file + ': no console.log')
        bad += 1
    }
    if (file.endsWith('.test.ts') && text.trimEnd().split('\\n').length > ${MAX_TEST_LINES}) {
        console.error(file + ': over ${MAX_TEST_LINES} lines, split it')
        bad += 1
    }
}
process.exit(bad === 0 ? 0 : 1)
`

const GREET = `export const hello = ({ name }: { name: string }): string => 'Hello, ' + name
export const bye = ({ name }: { name: string }): string => 'Bye, ' + name
`

const greetTest = (tests: string[]) =>
    `import { describe, expect, test } from 'bun:test'

import { bye, hello } from './greet'

describe('greet', () => {
${tests.join('\n\n')}
})
`

const SAYS_HELLO = `    test('says hello', () => {
        expect(hello({ name: 'Ada' })).toBe('Hello, Ada')
    })`
const SAYS_HELLO_TO_ANYONE = `    test('says hello to anyone', () => {
        expect(hello({ name: 'Bo' })).toBe('Hello, Bo')
    })`
const SAYS_BYE = `    test('says bye', () => {
        expect(bye({ name: 'Ada' })).toBe('Bye, Ada')
    })`
const SAYS_BYE_TO_ANYONE = `    test('says bye to anyone', () => {
        expect(bye({ name: 'Bo' })).toBe('Bye, Bo')
    })`

/** The over-limit test file, at the ticket's base. */
const GREET_TEST = greetTest([
    SAYS_HELLO,
    SAYS_HELLO_TO_ANYONE,
    SAYS_BYE,
    SAYS_BYE_TO_ANYONE,
])

describe('moved tests, end to end (#609)', () => {
    test('the test-writer splits an over-limit test file next to its new tests, and the ticket passes', async () => {
        expect(GREET_TEST.trimEnd().split('\n').length).toBeGreaterThan(
            MAX_TEST_LINES
        )
        const root = await mkdtemp(join(tmpdir(), 'luca-engine-moved-tests-'))
        try {
            const practice = await createPracticeRepo({
                root,
                files: {
                    'scripts/lint.ts': LINT_WITH_LIMIT,
                    'src/greet.ts': GREET,
                    'src/greet.test.ts': GREET_TEST,
                },
            })
            const { testWriter, implementer, reviewer } = happyTurns()
            const { action, records } = await practice.run({
                turns: [
                    {
                        ...testWriter,
                        files: {
                            ...testWriter.files,
                            'src/greet-hello.test.ts': greetTest([
                                SAYS_HELLO,
                                SAYS_HELLO_TO_ANYONE,
                            ]),
                            'src/greet-bye.test.ts': greetTest([
                                SAYS_BYE,
                                SAYS_BYE_TO_ANYONE,
                            ]),
                        },
                        act: async (cwd) => {
                            await rm(join(cwd, 'src/greet.test.ts'))
                        },
                    },
                    implementer,
                    reviewer,
                ],
            })

            const red = records.flatMap((record) =>
                record.kind === 'red_check' ? [record.content] : []
            )
            expect(red[0]).toMatchObject({ ok: true, problems: [] })
            expect(
                (red[0]?.notes ?? []).filter((note) =>
                    note.includes('moved from src/greet.test.ts')
                )
            ).toHaveLength(4)
            expect(latestStuck(records)).toBeNull()
            expect(action).toMatchObject({
                type: 'done',
                outcome: 'pr_opened',
            })
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    }, 120_000)
})
