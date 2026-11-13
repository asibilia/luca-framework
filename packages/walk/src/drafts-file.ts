import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import { CommitIdSchema } from './commit-id'
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
    /**
     * The pull request's head the draft was written (or last edited) at,
     * so its lines are never posted against a head they weren't written
     * for. Absent in older files, or when the head wasn't known: unknown.
     */
    commit: CommitIdSchema.optional().catch(undefined),
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
     * When the "looks good" marks were last checked for changed files
     * (#752, section 12): the last review's commit and the head they were
     * checked at, so a later visit removes only the marks of files that
     * changed since that head.
     */
    approved_checked: z
        .object({
            record_commit: CommitIdSchema,
            head_sha: CommitIdSchema,
        })
        .optional()
        // A check that isn't commit ids is dropped, never given to git:
        // the marks are checked again against the last review.
        .catch(undefined),
    walk: WalkPlaceSchema,
    /**
     * The last review's commit the walk's place was kept under (#752,
     * section 12); absent when there was none. A place kept under another
     * review is from an earlier visit.
     */
    walk_review: z.string().min(1).optional(),
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

/** The drafts in `text`; null when it is not a drafts file. */
const parseDrafts = (text: string): Drafts | null => {
    try {
        const parsed = DraftsSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

/** Where a drafts file that can't be read is moved: next to it, stamped. */
const asidePath = (path: string): string => {
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
    return path.replace(/\.json$/, `.corrupt-${stamp}.json`)
}

/**
 * The pull request's drafts, and where a drafts file that can't be read
 * was moved (`set_aside`, else null). Such a file is never written over:
 * it is moved aside and the drafts start empty. Throws when it can't be
 * moved. With no file, the drafts are empty.
 */
export const readDraftsFile = async ({
    walk_dir,
    ref,
}: {
    walk_dir: string
    ref: PullRequestRef
}): Promise<{ drafts: Drafts; set_aside: string | null }> => {
    const path = draftsPath({ walk_dir, ref })
    let text: string
    try {
        text = await readFile(path, 'utf8')
    } catch {
        return { drafts: emptyDrafts(), set_aside: null }
    }
    const drafts = parseDrafts(text)
    if (drafts !== null) return { drafts, set_aside: null }
    const aside = asidePath(path)
    await rename(path, aside)
    return { drafts: emptyDrafts(), set_aside: aside }
}

/** The pull request's drafts; see `readDraftsFile`. */
export const readDrafts = async (where: {
    walk_dir: string
    ref: PullRequestRef
}): Promise<Drafts> => (await readDraftsFile(where)).drafts

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
    onSetAside = async () => undefined,
}: {
    walk_dir: string
    ref: PullRequestRef
    change: (drafts: Drafts) => Drafts
    /** Runs with where a drafts file that can't be read was moved. */
    onSetAside?: (aside: string) => Promise<void>
}): Promise<Drafts> => {
    const path = draftsPath({ walk_dir, ref })
    const update = (updating.get(path) ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
            const read = await readDraftsFile({ walk_dir, ref })
            if (read.set_aside !== null) await onSetAside(read.set_aside)
            const drafts = change(read.drafts)
            await saveDrafts({ walk_dir, ref, drafts })
            return drafts
        })
    updating.set(path, update)
    return update
}

/**
 * Keeps `walk` as the owner's place, made under the last review at
 * `last_review` (null when there was none), leaving the rest of the
 * drafts as they are.
 */
export const saveWalkPlace = async ({
    walk_dir,
    ref,
    walk,
    last_review,
}: {
    walk_dir: string
    ref: PullRequestRef
    walk: WalkPlace
    last_review: string | null
}): Promise<void> => {
    await updateDrafts({
        walk_dir,
        ref,
        change: (drafts) => ({
            ...drafts,
            walk,
            walk_review: last_review ?? undefined,
        }),
    })
}
