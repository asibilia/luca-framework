import type { PullRequestRef } from './pull-request-ref'
import { readLastReview } from './review-record'
import type { WalkGit } from './walk-host'

import type { Gh } from '../../engine/src/story/story-github'

/**
 * A second visit (#752, section 12): what changed since the owner's last
 * review, read from the review record, so the walk goes only through the
 * stops whose files changed.
 */

export type Visit =
    /** No last review: the whole walk. */
    | { kind: 'first' }
    /** The last review was at `commit`; `changed` changed since. */
    | {
          kind: 'changed'
          commit: string
          changed: string[]
          approved_files: string[]
      }
    /** The last review was at the head: nothing changed. */
    | { kind: 'same'; commit: string; approved_files: string[] }
    /** The last review's commit is no longer in the history: the whole walk. */
    | { kind: 'gone'; commit: string; approved_files: string[] }

const short = (sha: string) => sha.slice(0, 7)

/** What changed since the owner's last review of `ref`, at `head_sha`. */
export const readVisit = async ({
    walk_dir,
    gh,
    git,
    ref,
    checkout,
    head_sha,
}: {
    walk_dir: string
    gh: Gh
    git: WalkGit
    ref: PullRequestRef
    checkout: string
    head_sha: string
}): Promise<Visit> => {
    const record = await readLastReview({ walk_dir, gh, ref })
    if (record === null) return { kind: 'first' }
    const { commit, approved_files } = record
    if (commit === head_sha) return { kind: 'same', commit, approved_files }
    const ancestor = await git({
        args: ['merge-base', '--is-ancestor', commit, head_sha],
        cwd: checkout,
    })
    if (!ancestor.ok) return { kind: 'gone', commit, approved_files }
    const diff = await git({
        args: ['diff', '--name-only', commit, head_sha],
        cwd: checkout,
    })
    if (!diff.ok) return { kind: 'gone', commit, approved_files }
    const changed = diff.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
    return { kind: 'changed', commit, changed, approved_files }
}

/**
 * The files the walk goes through: null for every file, else only those
 * that changed since the last review.
 */
export const filesToWalk = ({ visit }: { visit: Visit }): string[] | null =>
    visit.kind === 'changed' ? visit.changed : visit.kind === 'same' ? [] : null

/**
 * The approved files on this visit: the drafts' marks, else the record's,
 * without the files that changed since the last review. Once the marks
 * were checked against this last review (`checked_at` is its commit), the
 * drafts' marks stand as they are, so a file approved again stays approved.
 */
export const approvedOnVisit = ({
    visit,
    drafted,
    checked_at,
}: {
    visit: Visit
    drafted: string[]
    checked_at: string | null
}): string[] => {
    if (visit.kind !== 'first' && checked_at === visit.commit) return drafted
    const from =
        drafted.length > 0 || visit.kind === 'first'
            ? drafted
            : visit.approved_files
    return visit.kind === 'changed'
        ? from.filter((path) => !visit.changed.includes(path))
        : from
}

/**
 * The Summary panel's line about the last review; null on a first visit.
 *
 * @example
 * visitNote({ visit }) // 'Since your last review at abc1234, 3 files changed.'
 */
export const visitNote = ({ visit }: { visit: Visit }): string | null => {
    if (visit.kind === 'first') return null
    const at = short(visit.commit)
    if (visit.kind === 'same') {
        return `Nothing changed since your last review at ${at}.`
    }
    if (visit.kind === 'gone') {
        return `Your last review was at ${at}, which is no longer in this pull request's history, so the whole walk is shown.`
    }
    const count = visit.changed.length
    return `Since your last review at ${at}, ${count} ${count === 1 ? 'file' : 'files'} changed.`
}
