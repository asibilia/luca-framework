import { describe, expect, test } from 'bun:test'

import {
    readStory,
    STORY_SCHEMA_VERSION,
    StorySchema,
    storyPositions,
    type Story,
} from './story-schema'
import { groupedStory } from './testing/grouped-story'
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

/** A grouped story with one thing changed, as plain data (it may be invalid). */
const bentGrouped = (bend: (draft: Story) => void): unknown => {
    const draft = groupedStory()
    bend(draft)
    return draft
}

const stopAt = (draft: Story, index: number) => {
    const found = draft.stops[index]
    if (found === undefined) throw new Error(`no stop at ${index}`)
    return found
}

const fileAt = (draft: Story, index: number) => {
    const found = draft.map.files[index]
    if (found === undefined) throw new Error(`no map file at ${index}`)
    return found
}

const problemsOf = (value: unknown): string[] => {
    const read = readStory({ value })
    expect(read.status).toBe('invalid')
    return read.status === 'invalid' ? read.problems : []
}

describe('groups, noise files, and pinned ask', () => {
    test('groupedStory() passes StorySchema and keeps groups, noise, and stop_id', () => {
        const expected = groupedStory()
        const read = readStory({ value: expected })
        expect(read).toEqual({ status: 'ok', story: expected })
        expect(expected.map.files.length).toBe(47)
        expect(expected.stops.length).toBe(24)
        expect(expected.map.groups?.length).toBe(4)
        expect(expected.map.links.length).toBe(31)
        expect(expected.summary.feedback_wanted.stop_id).toBe('s6')
    })

    test('refuses a group_id on the loose-ends stop', () => {
        const value = bentGrouped((s) => {
            stopAt(s, 23).group_id = 'g4'
        })
        expect(problemsOf(value)).toEqual([
            "stops.23.group_id: the loose ends stop can't have a group_id",
        ])
    })

    test('refuses a stop with a group_id when map.groups is missing', () => {
        const value = bentGrouped((s) => {
            delete s.map.groups
            for (const stop of s.stops) {
                if (stop.id !== 's3') stop.group_id = null
            }
        })
        expect(problemsOf(value)).toEqual([
            'stops.2.group_id: stop s3 has a group_id but map.groups is missing',
        ])
    })

    test('refuses a walk stop with group_id null when map.groups is present', () => {
        const value = bentGrouped((s) => {
            stopAt(s, 2).group_id = null
        })
        expect(problemsOf(value)).toEqual([
            'stops.2.group_id: stop s3 has no group_id',
        ])
    })

    test('refuses a stop naming a group not in map.groups', () => {
        const value = bentGrouped((s) => {
            stopAt(s, 2).group_id = 'g9'
        })
        expect(problemsOf(value)).toEqual([
            'stops.2.group_id: stop s3 names group "g9", which is not in map.groups',
        ])
    })

    test('reports a group id listed three times once at map.groups', () => {
        const value = bentGrouped((s) => {
            s.map.groups?.push(
                { id: 'g1', title: 'Duplicate one', note: null },
                { id: 'g1', title: 'Duplicate two', note: null }
            )
        })
        expect(problemsOf(value)).toEqual([
            'map.groups: group id "g1" is used twice',
        ])
    })

    test('refuses a group that no stop names', () => {
        const value = bentGrouped((s) => {
            for (const stop of s.stops) {
                if (stop.group_id === 'g2') stop.group_id = 'g1'
            }
        })
        expect(problemsOf(value)).toEqual([
            'map.groups.1: group "g2" has no stops',
        ])
    })

    test('refuses map.groups listed out of the order their first stops are walked', () => {
        const value = bentGrouped((s) => {
            const groups = s.map.groups
            const second = groups?.[1]
            const third = groups?.[2]
            if (groups && second && third) {
                groups[1] = third
                groups[2] = second
            }
        })
        expect(problemsOf(value)).toEqual([
            'map.groups: map.groups must be in the order their first stops are walked',
        ])
    })

    test('refuses feedback_wanted.stop_id when it is not a stop', () => {
        const value = bent((s) => {
            s.summary.feedback_wanted.stop_id = 's9'
        })
        expect(problemsOf(value)).toEqual([
            'summary.feedback_wanted.stop_id: feedback_wanted.stop_id "s9" is not a stop',
        ])
    })

    test('reports a noise file read in the walk once at its noise field', () => {
        const value = bent((s) => {
            s.map.entry_path = 'packages/x/bun.lock'
            const file = fileAt(s, 0)
            file.path = 'packages/x/bun.lock'
            file.noise = 'lockfile'
            stopAt(s, 0).path = 'packages/x/bun.lock'
            change(s, 0).path = 'packages/x/bun.lock'
        })
        expect(problemsOf(value)).toEqual([
            'map.files.0.noise: noise file packages/x/bun.lock must only be read in the loose ends',
        ])
    })

    test('reports only the first group rule problem in table order per stop', () => {
        const without_groups = bent((s) => {
            stopAt(s, 1).group_id = 'g9'
        })
        expect(problemsOf(without_groups)).toEqual([
            "stops.1.group_id: the loose ends stop can't have a group_id",
        ])

        const with_groups = bentGrouped((s) => {
            stopAt(s, 23).group_id = 'g9'
        })
        expect(problemsOf(with_groups)).toEqual([
            "stops.23.group_id: the loose ends stop can't have a group_id",
        ])
    })
})
