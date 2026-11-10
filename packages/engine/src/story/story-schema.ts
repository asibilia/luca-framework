import { z } from 'zod'

import {
    StoryMapSchema,
    StoryStopSchema,
    StorySummarySchema,
    type StoryChange,
} from './story-parts'

/**
 * The PR story format (#738), the contract between the `/luca-pr-prep`
 * skill, which writes a story, and a review app, which reads it.
 *
 * `STORY_SCHEMA_VERSION` goes up whenever a reader of the old shape could
 * misread the new one. `readStory` tells a reader which case it has: a
 * story it understands, one written by a newer writer, or a broken one.
 */

/** The version of the shape below. */
export const STORY_SCHEMA_VERSION = 1

/** A full git commit id. */
const ShaSchema = z.string().regex(/^[0-9a-f]{40}$/, 'must be a full commit id')

/** Every change of a story, in walk order. */
const changesOf = ({
    stops,
}: {
    stops: { changes: StoryChange[] }[]
}): StoryChange[] => stops.flatMap((stop) => stop.changes)

/** The values that appear more than once. */
const repeated = ({ values }: { values: string[] }): string[] => [
    ...new Set(values.filter((value, at) => values.indexOf(value) !== at)),
]

const StoryShapeSchema = z.object({
    schema_version: z.literal(STORY_SCHEMA_VERSION),
    /** `owner/name` on GitHub. */
    repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'must be owner/name'),
    pr_number: z.number().int().positive(),
    pr_url: z.url(),
    title: z.string().min(1),
    base_ref: z.string().min(1),
    head_ref: z.string().min(1),
    /** The commit the story was written for. A PR whose head moved on has a stale story. */
    head_sha: ShaSchema,
    /** The commit the diff is read against (the merge base). */
    base_sha: ShaSchema,
    written_at: z.iso.datetime(),
    /** Who wrote it, such as the agent and model. */
    written_by: z.string().min(1),
    summary: StorySummarySchema,
    map: StoryMapSchema,
    stops: z.array(StoryStopSchema).min(1),
})

/**
 * A whole story. Beyond the shape, it checks what a reader relies on:
 *
 * - stop and change ids are unique;
 * - a `walk` stop names its file and all its changes are in it; the loose
 *   ends, if any, are one stop and the last one;
 * - the walk starts in the map's entry file;
 * - no change is left out: every file on the map has at least one change,
 *   and every change is in a file on the map;
 * - "how we got here" points at an earlier change;
 * - counts match their lists (blast radius), and `covered` / `found` match
 *   whether there are tests / refs.
 */
export const StorySchema = StoryShapeSchema.superRefine((story, ctx) => {
    const problem = (message: string, path: PropertyKey[]) =>
        ctx.addIssue({ code: 'custom', message, path })
    const changes = changesOf(story)

    for (const id of repeated({ values: story.stops.map(({ id }) => id) })) {
        problem(`stop id "${id}" is used twice`, ['stops'])
    }
    for (const id of repeated({ values: changes.map(({ id }) => id) })) {
        problem(`change id "${id}" is used twice`, ['stops'])
    }

    story.stops.forEach((stop, at) => {
        const last = at === story.stops.length - 1
        if (stop.kind === 'loose_ends') {
            if (!last)
                problem('the loose ends must be the last stop', ['stops', at])
            if (stop.path !== null) {
                problem('the loose ends stop has no path', [
                    'stops',
                    at,
                    'path',
                ])
            }
            return
        }
        if (stop.path === null) {
            problem('a walk stop names its file', ['stops', at, 'path'])
        }
        stop.changes.forEach((change, change_at) => {
            if (change.path !== stop.path) {
                problem(
                    `change "${change.id}" is in ${change.path}, not in its stop's file`,
                    ['stops', at, 'changes', change_at, 'path']
                )
            }
        })
    })

    const first = story.stops[0]
    if (first?.kind === 'walk' && first.path !== story.map.entry_path) {
        problem('the walk must start in map.entry_path', ['map', 'entry_path'])
    }

    const map_paths = new Set(story.map.files.map(({ path }) => path))
    const change_paths = new Set(changes.map(({ path }) => path))
    for (const path of repeated({
        values: story.map.files.map((file) => file.path),
    })) {
        problem(`${path} is on the map twice`, ['map', 'files'])
    }
    if (!map_paths.has(story.map.entry_path)) {
        problem('map.entry_path must be a file on the map', [
            'map',
            'entry_path',
        ])
    }
    for (const path of map_paths) {
        if (!change_paths.has(path)) {
            problem(`${path} is on the map but no stop reads it`, [
                'map',
                'files',
            ])
        }
    }
    for (const path of change_paths) {
        if (!map_paths.has(path)) {
            problem(`${path} has a change but is not on the map`, ['stops'])
        }
    }

    const seen = new Set<string>()
    for (const change of changes) {
        const where = ['stops', change.id]
        const from = change.how_we_got_here.from_change_id
        if (from !== null && !seen.has(from)) {
            problem(
                `"${change.id}" comes from "${from}", which is not an earlier change`,
                where
            )
        }
        seen.add(change.id)
        if (change.end_line < change.start_line) {
            problem(`"${change.id}" ends before it starts`, where)
        }
        if (change.proof.covered !== change.proof.tests.length > 0) {
            problem(
                `"${change.id}": proof.covered must match whether tests are listed`,
                where
            )
        }
        if (change.serves.found !== change.serves.refs.length > 0) {
            problem(
                `"${change.id}": serves.found must match whether refs are listed`,
                where
            )
        }
        const { dependents, dependents_total, dependents_outside_pr } =
            change.blast_radius
        const outside = dependents.filter(({ in_pr }) => !in_pr).length
        if (dependents_total !== dependents.length) {
            problem(
                `"${change.id}": dependents_total must equal the number of dependents listed`,
                where
            )
        }
        if (dependents_outside_pr !== outside) {
            problem(
                `"${change.id}": dependents_outside_pr must equal the dependents with in_pr false`,
                where
            )
        }
    }
})
export type Story = z.infer<typeof StorySchema>

/** What reading a story found. */
export type StoryRead =
    | { status: 'ok'; story: Story }
    /** Written by a newer writer than this reader understands. */
    | { status: 'newer_version'; schema_version: number }
    /** Not a story this reader can use; `problems` says why, one per line. */
    | { status: 'invalid'; problems: string[] }

const VersionOnlySchema = z.object({ schema_version: z.number().int() })

/**
 * Reads a value as a story. Never throws.
 *
 * @example
 * const read = readStory({ value: JSON.parse(text) })
 * if (read.status === 'ok') show(read.story)
 * if (read.status === 'newer_version') say('Update the app to read this story.')
 */
export const readStory = ({ value }: { value: unknown }): StoryRead => {
    const version = VersionOnlySchema.safeParse(value)
    if (version.success && version.data.schema_version > STORY_SCHEMA_VERSION) {
        return {
            status: 'newer_version',
            schema_version: version.data.schema_version,
        }
    }
    const parsed = StorySchema.safeParse(value)
    if (parsed.success) return { status: 'ok', story: parsed.data }
    return {
        status: 'invalid',
        problems: parsed.error.issues.map(
            (issue) => `${issue.path.join('.') || 'story'}: ${issue.message}`
        ),
    }
}

/** Where one change sits in the walk, for "stop 2 of 5, change 1 of 2 in this file". */
export type StoryPosition = {
    change_id: string
    stop_number: number
    stop_count: number
    /** This change's number among the story's changes in the same file. */
    change_in_file: number
    changes_in_file: number
}

/**
 * Where every change sits, in walk order.
 *
 * @example
 * storyPositions({ story })[0] // { change_id: 'c1', stop_number: 1, stop_count: 4, change_in_file: 1, changes_in_file: 2 }
 */
export const storyPositions = ({
    story,
}: {
    story: Story
}): StoryPosition[] => {
    const changes = changesOf(story)
    const inFile = (path: string) =>
        changes.filter((change) => change.path === path)
    return story.stops.flatMap((stop, at) =>
        stop.changes.map((change) => ({
            change_id: change.id,
            stop_number: at + 1,
            stop_count: story.stops.length,
            change_in_file:
                inFile(change.path).findIndex(({ id }) => id === change.id) + 1,
            changes_in_file: inFile(change.path).length,
        }))
    )
}
