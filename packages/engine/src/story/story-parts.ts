import { z } from 'zod'

/**
 * The parts of a PR story (#738): the building blocks `StorySchema` in
 * `story-schema.ts` is made of. A story is the written guide to one pull
 * request at one commit; the `/luca-pr-prep` skill writes it and a review
 * app reads it. Every key is `snake_case`, because a story is stored as
 * JSON (in PR comments, or in the private store).
 *
 * The shape is a contract between the writer and every reader. Change it
 * only together with `STORY_SCHEMA_VERSION`.
 */

/** A path inside the repo, with `/` separators, as git prints it. */
const RepoPathSchema = z
    .string()
    .min(1)
    .refine((path) => !path.startsWith('/'), 'must be relative to the repo')

/** Plain words a person reads. Never empty. */
const WordsSchema = z.string().trim().min(1)

/**
 * Something that is off, named so the reviewer can check it: the rule and
 * where it is broken. A story has no grades or scores; when nothing is off
 * there are no flags.
 *
 * @example
 * { kind: 'convention', rule: 'No classes', rule_source: 'AGENTS.md', path: 'src/a.ts', line: 44, message: 'Adds a class; the repo uses factory functions.' }
 */
export const StoryFlagSchema = z.object({
    /** `convention`: a repo rule. `cleanliness`: code hygiene. `risk`: could break something. */
    kind: z.enum(['convention', 'cleanliness', 'risk']),
    /** The rule, in a few words. */
    rule: WordsSchema,
    /** The file the rule comes from (`AGENTS.md`, ...), or null for common practice. */
    rule_source: z.string().min(1).nullable(),
    path: RepoPathSchema,
    /** The line at the PR's head, or null when the flag is about the whole file. */
    line: z.number().int().positive().nullable(),
    /** What is off, in one sentence. */
    message: WordsSchema,
})
export type StoryFlag = z.infer<typeof StoryFlagSchema>

/** A test that covers a change. */
export const StoryTestRefSchema = z.object({
    path: RepoPathSchema,
    line: z.number().int().positive().nullable(),
    /** The test's name, as its `test(...)` call says it. */
    name: z.string().min(1).nullable(),
})

/**
 * Proof: the tests that cover a change, or a plain "no test covers this".
 * `covered` is true exactly when `tests` is not empty.
 */
export const StoryProofSchema = z.object({
    covered: z.boolean(),
    tests: z.array(StoryTestRefSchema),
    /** One sentence: what the tests check, or that nothing covers this. */
    note: WordsSchema,
})

/** One thing a change was asked for by: a spec line, a ticket, an issue. */
export const StoryAskRefSchema = z.object({
    /** What it is, such as `#738` or `Spec #735, "Flags, not grades"`. */
    label: WordsSchema,
    url: z.url().nullable(),
    /** The words of the ask itself, when they can be quoted. */
    quote: z.string().min(1).nullable(),
})

/**
 * Which ask a change serves. `found` is true exactly when `refs` is not
 * empty; when nothing was found, `note` says so.
 */
export const StoryServesSchema = z.object({
    found: z.boolean(),
    refs: z.array(StoryAskRefSchema),
    note: WordsSchema,
})

/** One place that calls or depends on a changed thing. */
export const StoryDependentSchema = z.object({
    path: RepoPathSchema,
    line: z.number().int().positive().nullable(),
    /** True when this PR also changes that file. */
    in_pr: z.boolean(),
})

/**
 * Blast radius, counted not guessed: every place that calls or depends on
 * the changed thing. The two counts must match the list.
 */
export const StoryBlastRadiusSchema = z.object({
    dependents_total: z.number().int().nonnegative(),
    dependents_outside_pr: z.number().int().nonnegative(),
    dependents: z.array(StoryDependentSchema),
    /** How they were counted, such as the search that was run. */
    note: WordsSchema,
})

/**
 * One changed region and its context box: what the reviewer reads when
 * the cursor is on this change.
 */
export const StoryChangeSchema = z.object({
    /** Unique in the story, such as `c1`. */
    id: z.string().min(1),
    path: RepoPathSchema,
    /** `head`: lines of the new file. `base`: lines of the old file, for a region that was only deleted. */
    side: z.enum(['head', 'base']),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
    /** The function, type, or section changed, when it has a name. */
    symbol: z.string().min(1).nullable(),
    /** A few words naming the change. */
    title: WordsSchema,
    /** How we got here: the change that leads to this one, and how. */
    how_we_got_here: z.object({
        /** The earlier change that calls or needs this one; null at the entry point and in the loose ends. */
        from_change_id: z.string().min(1).nullable(),
        text: WordsSchema,
    }),
    /** Why this change was needed. */
    why_needed: WordsSchema,
    /** What it means for the architecture; says "none" plainly when nothing moves. */
    architecture_note: WordsSchema,
    /** The one thing the reviewer should verify here. */
    check_this: WordsSchema,
    proof: StoryProofSchema,
    serves: StoryServesSchema,
    blast_radius: StoryBlastRadiusSchema,
    flags: z.array(StoryFlagSchema),
})
export type StoryChange = z.infer<typeof StoryChangeSchema>

/**
 * One stop of the walk: a visit to one file, with the changes read there.
 * The last stop of a story may be the loose ends: changes outside the call
 * chain (config, types, deletions), from any number of files.
 */
export const StoryStopSchema = z.object({
    /** Unique in the story, such as `s1`. */
    id: z.string().min(1),
    kind: z.enum(['walk', 'loose_ends']),
    /** The file this stop visits; null for the loose ends. */
    path: RepoPathSchema.nullable(),
    title: WordsSchema,
    /** Why the walk comes here now. */
    why_here: WordsSchema,
    changes: z.array(StoryChangeSchema).min(1),
})
export type StoryStop = z.infer<typeof StoryStopSchema>

/** One file the PR touches, on the map. */
export const StoryMapFileSchema = z.object({
    path: RepoPathSchema,
    status: z.enum(['added', 'modified', 'deleted', 'renamed']),
    /** The old path of a renamed file. */
    previous_path: RepoPathSchema.nullable(),
    /** What the file is for, in one line. */
    role: WordsSchema,
    /** False for a file outside the call chain: it is read in the loose ends. */
    in_walk: z.boolean(),
})

/** One link between two files on the map. Either end may be a file the PR does not change. */
export const StoryMapLinkSchema = z.object({
    from_path: RepoPathSchema,
    to_path: RepoPathSchema,
    kind: z.enum(['calls', 'imports', 'reads', 'tests', 'configures']),
    note: z.string().min(1).nullable(),
})

/** The structure of the change: files, how they link, and where to start. */
export const StoryMapSchema = z.object({
    /** The file the walk starts in. */
    entry_path: RepoPathSchema,
    files: z.array(StoryMapFileSchema).min(1),
    links: z.array(StoryMapLinkSchema),
    /** New modules, moved boundaries, things removed. */
    architecture_note: WordsSchema,
})

/** The whole PR in a few lines. */
export const StorySummarySchema = z.object({
    kind: z.enum([
        'enhancement',
        'fix',
        'refactor',
        'docs',
        'test',
        'chore',
        'mixed',
    ]),
    what_changed: WordsSchema,
    /** How it behaved before. */
    before: WordsSchema,
    /** How it behaves now. */
    after: WordsSchema,
    feedback_wanted: z.object({
        text: WordsSchema,
        /** `author`: the PR says so. `guessed`: what the story's writer was least sure about. */
        source: z.enum(['author', 'guessed']),
    }),
    counts: z.object({
        files_added: z.number().int().nonnegative(),
        files_changed: z.number().int().nonnegative(),
        files_deleted: z.number().int().nonnegative(),
        lines_added: z.number().int().nonnegative(),
        lines_removed: z.number().int().nonnegative(),
    }),
    /** A rough time to review, in minutes. */
    review_minutes: z.number().int().positive(),
    /** The roll-up for the whole PR: the flags that matter most. */
    flags: z.array(StoryFlagSchema),
})
export type StorySummary = z.infer<typeof StorySummarySchema>
