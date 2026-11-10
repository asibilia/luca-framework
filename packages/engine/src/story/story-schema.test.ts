import { describe, expect, test } from 'bun:test'

import {
    readStory,
    STORY_SCHEMA_VERSION,
    StorySchema,
    storyPositions,
    type Story,
} from './story-schema'
import { story, storyChange } from './testing/story-fixtures'

/** A story with one thing changed, as plain data (it may be invalid). */
const bent = (bend: (draft: Story) => void): unknown => {
    const draft = story()
    bend(draft)
    return draft
}

/** The first change of a stop. */
const change = (draft: Story, stop: number) => {
    const found = draft.stops[stop]?.changes[0]
    if (found === undefined) throw new Error(`no change in stop ${stop}`)
    return found
}

describe('the story schema', () => {
    test('a whole story reads back unchanged, with each change placed in the walk', () => {
        const read = readStory({ value: JSON.parse(JSON.stringify(story())) })
        expect(read).toEqual({ status: 'ok', story: story() })

        const two_in_one_file = story()
        two_in_one_file.stops[0]?.changes.push(
            storyChange({
                id: 'c1b',
                path: 'src/core/run-ticket.ts',
                from_change_id: 'c1',
            })
        )
        expect(storyPositions({ story: two_in_one_file })).toEqual([
            {
                change_id: 'c1',
                stop_number: 1,
                stop_count: 2,
                change_in_file: 1,
                changes_in_file: 2,
            },
            {
                change_id: 'c1b',
                stop_number: 1,
                stop_count: 2,
                change_in_file: 2,
                changes_in_file: 2,
            },
            {
                change_id: 'c2',
                stop_number: 2,
                stop_count: 2,
                change_in_file: 1,
                changes_in_file: 1,
            },
        ])
    })

    test('a story that breaks what a reader relies on is refused, and says why', () => {
        const cases: [string, unknown][] = [
            ['"c1" is used twice', bent((s) => (change(s, 1).id = 'c1'))],
            [
                'loose ends must be the last stop',
                bent((s) => s.stops.reverse()),
            ],
            [
                'must start in map.entry_path',
                bent((s) => (s.map.entry_path = 'src/config/schema.ts')),
            ],
            ['on the map but no stop reads it', bent((s) => s.stops.pop())],
            [
                'has a change but is not on the map',
                bent((s) => s.map.files.pop()),
            ],
            [
                'not an earlier change',
                bent(
                    (s) => (change(s, 0).how_we_got_here.from_change_id = 'c2')
                ),
            ],
            [
                'dependents_total must equal',
                bent((s) => (change(s, 0).blast_radius.dependents_total = 7)),
            ],
            [
                'dependents_outside_pr must equal',
                bent(
                    (s) => (change(s, 0).blast_radius.dependents_outside_pr = 0)
                ),
            ],
            [
                'proof.covered must match',
                bent((s) => (change(s, 0).proof.tests = [])),
            ],
            [
                'serves.found must match',
                bent((s) => (change(s, 0).serves.found = false)),
            ],
            ['must be a full commit id', bent((s) => (s.head_sha = 'abc123'))],
        ]
        for (const [words, value] of cases) {
            const read = readStory({ value })
            expect(read.status).toBe('invalid')
            expect(
                read.status === 'invalid' ? read.problems.join('\n') : ''
            ).toContain(words)
        }
    })

    test('a newer story is told apart from a broken one, and keys are snake_case', () => {
        expect(
            readStory({
                value: {
                    ...story(),
                    schema_version: STORY_SCHEMA_VERSION + 1,
                    extra: true,
                },
            })
        ).toEqual({
            status: 'newer_version',
            schema_version: STORY_SCHEMA_VERSION + 1,
        })

        const { pr_number, ...rest } = story()
        const camel = readStory({ value: { ...rest, prNumber: pr_number } })
        expect(camel.status).toBe('invalid')

        const keys = (value: unknown): string[] =>
            Array.isArray(value)
                ? value.flatMap(keys)
                : typeof value === 'object' && value !== null
                  ? Object.entries(value).flatMap(([key, inner]) => [
                        key,
                        ...keys(inner),
                    ])
                  : []
        expect(
            keys(StorySchema.parse(story())).filter(
                (key) => !/^[a-z0-9_]+$/.test(key)
            )
        ).toEqual([])
    })
})
