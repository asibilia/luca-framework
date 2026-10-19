import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    happyTurns,
    latestStuck,
    PRACTICE_ENGINE_CONFIG,
} from '../testing/practice-repo'

/**
 * Seam 2, test helpers (#619), end to end on the practice repo: with
 * `test_helper_patterns`, the test-writer writes a shared helper beside its
 * test. The guard lets it, the red check doesn't check it as a test, the
 * feature map needn't list it, and it is committed with the test. The
 * gates, commits, pushes, and PR are real.
 */

const MAP_PATH = 'docs/feature-map.md'

/** A map listing the ticket's test file, and not the helper. */
const MAP = `# Feature map

## Adding numbers

Reached by: \`sum({ numbers })\`.

Tests:
- \`src/sum.test.ts\`
`

const HELPER = 'src/testing/numbers.ts'

/** `SUM_TEST`, with its numbers from the shared helper. */
const SUM_TEST_WITH_HELPER = `import { describe, expect, test } from 'bun:test'

import { sum } from './sum'
import { ONE_AND_TWO } from './testing/numbers'

describe('sum', () => {
    test('adds two numbers', () => {
        expect(sum({ numbers: ONE_AND_TWO })).toBe(3)
    })

    test('of no numbers is zero', () => {
        expect(sum({ numbers: [] })).toBe(0)
    })
})
`

const redChecks = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'red_check' ? [record.content] : []
    )

const commits = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'commit_made'
            ? [{ stage: record.content.stage, files: record.content.files }]
            : []
    )

const failures = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'agent_failed' ? [record.content] : []
    )

describe('test helpers, end to end (#619)', () => {
    test('a helper the test-writer writes is not checked as a test nor required in the feature map, and is committed with the red commit', async () => {
        const root = await mkdtemp(join(tmpdir(), 'luca-engine-test-helpers-'))
        try {
            const practice = await createPracticeRepo({
                root,
                config: {
                    ...PRACTICE_ENGINE_CONFIG,
                    feature_map: MAP_PATH,
                    test_helper_patterns: ['src/testing/**'],
                },
                files: { [MAP_PATH]: MAP },
            })
            const { testWriter, implementer, reviewer } = happyTurns()
            const { action, records } = await practice.run({
                turns: [
                    {
                        ...testWriter,
                        files: {
                            'src/sum.test.ts': SUM_TEST_WITH_HELPER,
                            [HELPER]: 'export const ONE_AND_TWO = [1, 2]\n',
                        },
                    },
                    implementer,
                    reviewer,
                ],
            })

            expect(failures(records)).toEqual([])
            const [first, ...rest] = redChecks(records)
            expect(first).toMatchObject({ ok: true, problems: [] })
            expect(first?.notes.join('\n')).not.toContain(HELPER)
            expect(rest).toEqual([])
            expect(
                commits(records).find(({ stage }) => stage === 'red')
            ).toEqual({ stage: 'red', files: ['src/sum.test.ts', HELPER] })
            expect(latestStuck(records)).toBeNull()
            expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    }, 120_000)
})
