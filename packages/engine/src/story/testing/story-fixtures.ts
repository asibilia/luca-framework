import type { StoryChange, StoryStop } from '../story-parts'
import type { Story } from '../story-schema'

/**
 * Stories for tests (#738): a small valid one, and ways to grow or bend it.
 */

/** A full commit id made of one repeated character. */
export const sha = ({ char }: { char: string }): string => char.repeat(40)

/** One valid change in `path`, with a test, an ask, and two dependents. */
export const storyChange = ({
    id,
    path,
    from_change_id = null,
}: {
    id: string
    path: string
    from_change_id?: string | null
}): StoryChange => ({
    id,
    path,
    side: 'head',
    start_line: 44,
    end_line: 46,
    symbol: 'runTicket',
    title: 'Ask autoRetry before the owner',
    how_we_got_here: {
        from_change_id,
        text: 'The run loop calls runTicket for every ticket.',
    },
    why_needed: 'A stuck ticket used to stop the run and wait for the owner.',
    architecture_note: 'None: the call stays inside core.',
    check_this: 'Is two retries the right budget?',
    proof: {
        covered: true,
        tests: [
            {
                path: 'src/core/run-ticket.test.ts',
                line: 12,
                name: 'retries a stuck ticket',
            },
        ],
        note: 'One test covers the retry path.',
    },
    serves: {
        found: true,
        refs: [
            {
                label: '#705',
                url: 'https://github.com/acme/site/issues/705',
                quote: 'Retry a routine stuck once.',
            },
        ],
        note: 'The linked issue asks for it.',
    },
    blast_radius: {
        dependents_total: 2,
        dependents_outside_pr: 1,
        dependents: [
            { path: 'src/cli/luca-run.ts', line: 80, in_pr: true },
            { path: 'src/core/resume.ts', line: 15, in_pr: false },
        ],
        note: 'Counted with a search for runTicket( in src.',
    },
    flags: [],
})

/** A small valid story: one walk stop and the loose ends. */
export const story = (): Story => ({
    schema_version: 1,
    repo: 'acme/site',
    pr_number: 12,
    pr_url: 'https://github.com/acme/site/pull/12',
    title: 'Retry stuck tickets',
    base_ref: 'main',
    head_ref: 'retry-stuck',
    head_sha: sha({ char: 'a' }),
    base_sha: sha({ char: 'b' }),
    written_at: '2026-11-10T12:00:00Z',
    written_by: 'a test',
    summary: {
        kind: 'enhancement',
        what_changed: 'A stuck ticket is retried before the owner is asked.',
        before: 'Every stuck ticket waited for the owner.',
        after: 'Only the third failure waits for the owner.',
        feedback_wanted: { text: 'The retry budget.', source: 'guessed' },
        counts: {
            files_added: 0,
            files_changed: 2,
            files_deleted: 0,
            lines_added: 10,
            lines_removed: 2,
        },
        review_minutes: 10,
        flags: [
            {
                kind: 'convention',
                rule: 'No classes',
                rule_source: 'AGENTS.md',
                path: 'src/core/run-ticket.ts',
                line: 44,
                message: 'Adds a class; the repo uses factory functions.',
            },
        ],
    },
    map: {
        entry_path: 'src/core/run-ticket.ts',
        files: [
            {
                path: 'src/core/run-ticket.ts',
                status: 'modified',
                previous_path: null,
                role: 'Builds one ticket.',
                in_walk: true,
            },
            {
                path: 'src/config/schema.ts',
                status: 'modified',
                previous_path: null,
                role: 'The config shape.',
                in_walk: false,
            },
        ],
        links: [
            {
                from_path: 'src/cli/luca-run.ts',
                to_path: 'src/core/run-ticket.ts',
                kind: 'calls',
                note: null,
            },
        ],
        architecture_note: 'No new modules.',
    },
    stops: [
        {
            id: 's1',
            kind: 'walk',
            path: 'src/core/run-ticket.ts',
            title: 'Where a stuck ticket is handled',
            why_here: 'It is the entry point of the change.',
            changes: [
                storyChange({ id: 'c1', path: 'src/core/run-ticket.ts' }),
            ],
        },
        {
            id: 's2',
            kind: 'loose_ends',
            path: null,
            title: 'Loose ends',
            why_here: 'Config that the walk does not pass through.',
            changes: [storyChange({ id: 'c2', path: 'src/config/schema.ts' })],
        },
    ],
})

/** The parts of a story only a reader of the code writes (#743). */
export type StoryAnswer = {
    summary: Record<string, unknown>
    map: unknown
    stops: unknown[]
}

const servesNothing = (change: StoryChange): StoryChange => ({
    ...change,
    serves: {
        found: false,
        refs: [],
        note: 'It serves nothing the spec or tickets asked for.',
    },
})

/**
 * A story-writer's valid answer (#743): the fixture story's summary (with
 * counts that are wrong on purpose, and `author` as its feedback's source),
 * map and stops, with changes that serve nothing.
 */
export const storyAnswer = (): StoryAnswer => {
    const base = story()
    return {
        summary: {
            ...base.summary,
            feedback_wanted: {
                text: 'Whether an empty list should sum to zero.',
                source: 'author',
            },
            counts: {
                files_added: 9,
                files_changed: 9,
                files_deleted: 9,
                lines_added: 999,
                lines_removed: 999,
            },
        },
        map: base.map,
        stops: base.stops.map((stop) => ({
            ...stop,
            changes: stop.changes.map(servesNothing),
        })),
    }
}

/**
 * A valid story with `walk_stops` walk stops, each in its own file, to
 * make one that is too long for a single comment. Its titles hold text
 * that would break a markdown block if it weren't encoded.
 */
export const longStory = ({ walk_stops }: { walk_stops: number }): Story => {
    const base = story()
    const paths = Array.from(
        { length: walk_stops },
        (_, at) => `src/core/file-${at}.ts`
    )
    const files: Story['map']['files'] = paths.map((path) => ({
        path,
        status: 'added',
        previous_path: null,
        role: 'One of many files.',
        in_walk: true,
    }))
    const stops: StoryStop[] = paths.map((path, at) => ({
        id: `s${at}`,
        kind: 'walk',
        path,
        title: `Stop ${at} “with” <markup>, \`\`\` and --> in it`,
        why_here: 'The one before calls it.',
        changes: [storyChange({ id: `c${at}`, path })],
    }))
    return {
        ...base,
        map: { ...base.map, entry_path: paths[0] ?? '', files },
        stops,
    }
}
