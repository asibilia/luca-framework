import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import type { PullRequestRef } from './pull-request-ref'

/**
 * A pull request's drafts file (#752, sections 10 and 15): the owner's
 * unsent feedback and where they are in the walk, kept on this computer
 * at `<walk_dir>/drafts/<owner>/<name>/pr-<number>.json`.
 */

const DraftCommentSchema = z.object({
    id: z.string().min(1),
    kind: z.enum(['line', 'file', 'pull_request']),
    path: z.string().min(1).nullable(),
    side: z.enum(['head', 'base']).nullable(),
    start_line: z.number().int().positive().nullable(),
    end_line: z.number().int().positive().nullable(),
    body: z.string(),
})
export type DraftComment = z.infer<typeof DraftCommentSchema>

/** Where the owner is in the walk. */
export const WalkPlaceSchema = z.object({
    current_stop_id: z.string().min(1).nullable(),
    done_stop_ids: z.array(z.string().min(1)),
    last_change_id: z.string().min(1).nullable(),
})
export type WalkPlace = z.infer<typeof WalkPlaceSchema>

export const DraftsSchema = z.object({
    schema_version: z.literal(1),
    comments: z.array(DraftCommentSchema),
    approved_files: z.array(z.string().min(1)),
    /**
     * The last review's commit the "looks good" marks were last checked
     * against (#752, section 12), so a mark made after that check is kept.
     */
    approved_checked_at: z.string().min(1).optional(),
    walk: WalkPlaceSchema,
})
export type Drafts = z.infer<typeof DraftsSchema>

const emptyDrafts = (): Drafts => ({
    schema_version: 1,
    comments: [],
    approved_files: [],
    walk: { current_stop_id: null, done_stop_ids: [], last_change_id: null },
})

/** The drafts file of one pull request. */
export const draftsPath = ({
    walk_dir,
    ref,
}: {
    walk_dir: string
    ref: PullRequestRef
}): string =>
    join(walk_dir, 'drafts', ...ref.repo.split('/'), `pr-${ref.number}.json`)

/** The pull request's drafts; empty when there is no file or it can't be read. */
export const readDrafts = async ({
    walk_dir,
    ref,
}: {
    walk_dir: string
    ref: PullRequestRef
}): Promise<Drafts> => {
    let text: string
    try {
        text = await readFile(draftsPath({ walk_dir, ref }), 'utf8')
    } catch {
        return emptyDrafts()
    }
    try {
        const parsed = DraftsSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : emptyDrafts()
    } catch {
        return emptyDrafts()
    }
}

/** Writes the pull request's drafts whole, through a temporary file. */
export const saveDrafts = async ({
    walk_dir,
    ref,
    drafts,
}: {
    walk_dir: string
    ref: PullRequestRef
    drafts: Drafts
}): Promise<void> => {
    const path = draftsPath({ walk_dir, ref })
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(drafts, null, 4)}\n`)
    await rename(temporary, path)
}

/** The last update of each drafts file, so updates run one at a time. */
const updating = new Map<string, Promise<unknown>>()

/**
 * Reads the pull request's drafts, changes them with `change` and saves
 * them, one update at a time per file, so no update loses another's.
 * Answers the drafts as saved.
 */
export const updateDrafts = ({
    walk_dir,
    ref,
    change,
}: {
    walk_dir: string
    ref: PullRequestRef
    change: (drafts: Drafts) => Drafts
}): Promise<Drafts> => {
    const path = draftsPath({ walk_dir, ref })
    const update = (updating.get(path) ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
            const drafts = change(await readDrafts({ walk_dir, ref }))
            await saveDrafts({ walk_dir, ref, drafts })
            return drafts
        })
    updating.set(path, update)
    return update
}

/** Keeps `walk` as the owner's place, leaving the rest of the drafts as they are. */
export const saveWalkPlace = async ({
    walk_dir,
    ref,
    walk,
}: {
    walk_dir: string
    ref: PullRequestRef
    walk: WalkPlace
}): Promise<void> => {
    await updateDrafts({
        walk_dir,
        ref,
        change: (drafts) => ({ ...drafts, walk }),
    })
}
