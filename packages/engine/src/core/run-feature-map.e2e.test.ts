import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    happyTurns,
    latestStuck,
    PRACTICE_ENGINE_CONFIG,
} from '../testing/practice-repo'

/**
 * Seam 2, the feature map (#583), end to end on the practice repo: with
 * `feature_map` in the config, the red check refuses a new test file the map
 * doesn't list, and a map that is missing is a problem naming it, not a crash.
 * The test-writer's next try may write the map itself. The gates, commits,
 * pushes, and PR are real.
 */

const MAP_PATH = 'docs/feature-map.md'

const MAP_CONFIG = { ...PRACTICE_ENGINE_CONFIG, feature_map: MAP_PATH }

const MAP_WITHOUT_SUM = `# Feature map

## Reading the README

Reached by: \`cat README.md\`.

Tests:
- \`src/readme.test.ts\`
`

const MAP_WITH_SUM = `${MAP_WITHOUT_SUM}
## Adding numbers

Reached by: \`sum({ numbers })\`.

Tests:
- \`src/sum.test.ts\`
`

/** Runs the engine once on a practice repo with the feature map in its config. */
const practiceRun = async ({
    files,
    turns,
    config = MAP_CONFIG,
}: {
    files?: Record<string, string>
    turns: ScriptedTurn[]
    config?: object
}) => {
    const root = await mkdtemp(join(tmpdir(), 'luca-engine-feature-map-'))
    try {
        const practice = await createPracticeRepo({
            root,
            config,
            files,
        })
        return await practice.run({ turns })
    } finally {
        await rm(root, { recursive: true, force: true })
    }
}

/** The same map, its test files written with a leading `./`. */
const MAP_WITH_DOT_SLASH = MAP_WITH_SUM.replace('`src/sum', '`./src/sum')

const redChecks = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'red_check' ? [record.content] : []
    )

describe('the feature map, end to end', () => {
    test("a new test file the map doesn't list sends the test-writer back, and it may list the file in the map", async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practiceRun({
            files: { [MAP_PATH]: MAP_WITHOUT_SUM },
            turns: [
                testWriter,
                { ...testWriter, files: { [MAP_PATH]: MAP_WITH_SUM } },
                implementer,
                reviewer,
            ],
        })

        const [first, second] = redChecks(records)
        expect(first?.ok).toBe(false)
        expect(first?.problems).toContain(
            `src/sum.test.ts: a new test file the feature map doesn't list (add it under a feature in ${MAP_PATH})`
        )
        expect(second).toMatchObject({ ok: true, problems: [] })
        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    }, 120_000)

    test('with a map folder, a new test file on no page sends the test-writer back naming the folder, and it may list the file on a new page (#597)', async () => {
        const folder = 'docs/feature-map'
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practiceRun({
            config: { ...PRACTICE_ENGINE_CONFIG, feature_map: folder },
            files: {
                [`${folder}/index.md`]: '# Feature map\n\nOne page per area.\n',
                [`${folder}/readme.md`]: MAP_WITHOUT_SUM,
            },
            turns: [
                testWriter,
                {
                    ...testWriter,
                    files: {
                        [`${folder}/numbers.md`]:
                            '## Adding numbers\n\nTests:\n- `src/sum.test.ts`\n',
                    },
                },
                implementer,
                reviewer,
            ],
        })

        const [first, second] = redChecks(records)
        expect(first?.ok).toBe(false)
        expect(
            (first?.problems ?? []).filter(
                (problem) =>
                    problem.startsWith(
                        "src/sum.test.ts: a new test file the feature map doesn't list"
                    ) && problem.includes(folder)
            )
        ).toHaveLength(1)
        expect(second).toMatchObject({ ok: true, problems: [] })
        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    }, 120_000)

    test('a configured map that is missing is a problem naming it, and the test-writer may add it', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practiceRun({
            turns: [
                testWriter,
                { ...testWriter, files: { [MAP_PATH]: MAP_WITH_SUM } },
                implementer,
                reviewer,
            ],
        })

        const [first, second] = redChecks(records)
        expect(first?.ok).toBe(false)
        expect(first?.problems).toContain(
            `The feature map ${MAP_PATH} is missing: restore it, or add it with the new test file listed`
        )
        expect(second).toMatchObject({ ok: true, problems: [] })
        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    }, 120_000)

    test('a map spelled "./docs/feature-map.md", listing its files with "./", still works: the test-writer may write it and the red check finds the entry', async () => {
        const { testWriter, implementer, reviewer } = happyTurns()
        const { action, records } = await practiceRun({
            config: { ...PRACTICE_ENGINE_CONFIG, feature_map: `./${MAP_PATH}` },
            turns: [
                testWriter,
                { ...testWriter, files: { [MAP_PATH]: MAP_WITH_DOT_SLASH } },
                implementer,
                reviewer,
            ],
        })

        const [first, second] = redChecks(records)
        // The first problem names the map by its clean path.
        expect(first?.problems).toContain(
            `The feature map ${MAP_PATH} is missing: restore it, or add it with the new test file listed`
        )
        expect(second).toMatchObject({ ok: true, problems: [] })
        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
    }, 120_000)
})
