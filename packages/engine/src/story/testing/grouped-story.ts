import { story, storyChange } from './story-fixtures'

import type {
    StoryChange,
    StoryFlag,
    StoryNoiseKind,
    StoryStop,
} from '../story-parts'
import type { Story } from '../story-schema'

/**
 * A 47-file, 24-stop, 4-group story for tests (#776): shaped like a real
 * medium PR with groups, noise files, blast radius, missing proof, flags,
 * an outside link, and a pinned ask. Built with loops from made-up names.
 */

const WALK_STOP_COUNT = 23
const LOOSE_CODE_COUNT = 20

const NOISE_FILES: readonly { path: string; noise: StoryNoiseKind }[] = [
    { path: 'bun.lock', noise: 'lockfile' },
    { path: 'src/generated/schema.gen.ts', noise: 'generated' },
    { path: 'data/sample-players.json', noise: 'sample_data' },
    { path: 'test/fixtures/players.json', noise: 'fixture' },
]

const groupNumberOf = ({ stop_number }: { stop_number: number }): number =>
    Math.min(4, Math.floor((stop_number - 1) / 6) + 1)

const walkPathOf = ({ stop_number }: { stop_number: number }): string =>
    `src/g${groupNumberOf({ stop_number })}/s${stop_number}.ts`

const baseCleanChange = ({
    id,
    path,
    from_change_id,
    title,
    start_line,
    end_line,
}: {
    id: string
    path: string
    from_change_id: string | null
    title: string
    start_line: number
    end_line: number
}): StoryChange => {
    const base = storyChange({ id, path, from_change_id })
    return {
        ...base,
        title,
        start_line,
        end_line,
        blast_radius: {
            ...base.blast_radius,
            dependents: [],
            dependents_total: 0,
            dependents_outside_pr: 0,
        },
        flags: [],
    }
}

const walkChangeOf = ({
    stop_number,
    path,
}: {
    stop_number: number
    path: string
}): StoryChange => {
    const change = baseCleanChange({
        id: `c${stop_number}`,
        path,
        from_change_id: stop_number === 1 ? null : `c${stop_number - 1}`,
        title: `Change ${stop_number}`,
        start_line: 1,
        end_line: 20,
    })
    if (stop_number === 3) {
        return {
            ...change,
            blast_radius: {
                ...change.blast_radius,
                dependents: Array.from({ length: 7 }, (_, at) => ({
                    path: `src/app/caller-${at + 1}.ts`,
                    line: 10,
                    in_pr: false,
                })),
                dependents_total: 7,
                dependents_outside_pr: 7,
            },
        }
    }
    if (stop_number === 4) {
        return {
            ...change,
            proof: {
                covered: false,
                tests: [],
                note: 'Nothing covers this.',
            },
        }
    }
    if (stop_number === 5) {
        const flag: StoryFlag = {
            kind: 'risk',
            rule: 'Check the input',
            rule_source: null,
            path: 'src/g1/s5.ts',
            line: 3,
            message: 'The input is not checked.',
        }
        return {
            ...change,
            flags: [flag, { ...flag }],
        }
    }
    return change
}

/** A valid 47-file story with 4 groups, 24 stops, 4 noise files, 31 links, and a pinned ask. */
export const groupedStory = (): Story => {
    const base = story()
    const base_file = base.map.files[0]
    if (base_file === undefined) throw new Error('base story has no map files')

    const groups = Array.from({ length: 4 }, (_, at) => ({
        id: `g${at + 1}`,
        title: `Group ${at + 1}`,
        note: at === 0 ? 'Where it starts' : null,
    }))

    const walk_files: Story['map']['files'] = Array.from(
        { length: WALK_STOP_COUNT },
        (_, at) => ({
            ...base_file,
            path: walkPathOf({ stop_number: at + 1 }),
            status: 'added',
            previous_path: null,
            in_walk: true,
            noise: null,
        })
    )

    const loose_code_paths = Array.from(
        { length: LOOSE_CODE_COUNT },
        (_, at) => `src/loose/file-${String(at + 1).padStart(2, '0')}.ts`
    )

    const loose_code_files: Story['map']['files'] = loose_code_paths.map(
        (path) => ({
            ...base_file,
            path,
            status: 'added',
            previous_path: null,
            in_walk: false,
            noise: null,
        })
    )

    const loose_noise_files: Story['map']['files'] = NOISE_FILES.map(
        ({ path, noise }) => ({
            ...base_file,
            path,
            status: 'added',
            previous_path: null,
            in_walk: false,
            noise,
        })
    )

    const walk_stops: StoryStop[] = Array.from(
        { length: WALK_STOP_COUNT },
        (_, at) => {
            const stop_number = at + 1
            const path = walkPathOf({ stop_number })
            return {
                id: `s${stop_number}`,
                kind: 'walk',
                group_id: `g${groupNumberOf({ stop_number })}`,
                path,
                title: `Step ${stop_number}`,
                why_here: `Step ${stop_number} of the flow.`,
                changes: [walkChangeOf({ stop_number, path })],
            }
        }
    )

    const loose_paths = [
        ...loose_code_paths,
        ...NOISE_FILES.map(({ path }) => path),
    ]
    const loose_stop: StoryStop = {
        id: 's24',
        kind: 'loose_ends',
        group_id: null,
        path: null,
        title: 'Loose ends',
        why_here: 'Files outside the call chain.',
        changes: loose_paths.map((path, at) =>
            baseCleanChange({
                id: `c${24 + at}`,
                path,
                from_change_id: null,
                title: `Loose change ${at + 1}`,
                start_line: 1,
                end_line: 5,
            })
        ),
    }

    const call_links: Story['map']['links'] = Array.from(
        { length: WALK_STOP_COUNT - 1 },
        (_, at) => ({
            from_path: walkPathOf({ stop_number: at + 1 }),
            to_path: walkPathOf({ stop_number: at + 2 }),
            kind: 'calls',
            note: null,
        })
    )

    const test_links: Story['map']['links'] = Array.from(
        { length: 8 },
        (_, at) => ({
            from_path: `src/loose/file-${String(at + 1).padStart(2, '0')}.ts`,
            to_path: walkPathOf({ stop_number: at + 1 }),
            kind: 'tests',
            note: null,
        })
    )

    const links: Story['map']['links'] = [
        ...call_links,
        ...test_links,
        {
            from_path: 'src/g4/s23.ts',
            to_path: 'src/outside/config.ts',
            kind: 'reads',
            note: null,
        },
    ]

    return {
        ...base,
        summary: {
            ...base.summary,
            feedback_wanted: {
                ...base.summary.feedback_wanted,
                source: 'author',
                stop_id: 's6',
            },
            review_minutes: 100,
        },
        map: {
            ...base.map,
            entry_path: 'src/g1/s1.ts',
            groups,
            files: [...walk_files, ...loose_code_files, ...loose_noise_files],
            links,
        },
        stops: [...walk_stops, loose_stop],
    }
}
