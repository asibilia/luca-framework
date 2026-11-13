import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
    readDrafts,
    updateDrafts,
    type DraftComment,
    type Drafts,
} from './drafts-file'
import type { GitHubThread } from './github-conversation'
import type { PullRequestRef } from './pull-request-ref'
import type { WalkHost, WalkThread } from './walk-host'
import { baseUri, checkoutFileUri, documentOf } from './walk-uris'

/**
 * The owner's feedback, kept until it is sent (#752, section 10): line and
 * range comments, suggested changes, file and pull request comments, and
 * "looks good" marks, each saved to the drafts file at once.
 */

const DRAFT_LABEL = 'Draft'
const GITHUB_LABEL = 'On GitHub'
const DRAFT_AUTHOR = 'You'
const FENCE = '```'

/**
 * The feedback on `ref`, as its drafts file keeps it.
 *
 * @param base_sha - The commit `base` side drafts are shown against; null
 *   when there is none to show them on.
 * @param onApprovedChanged - Runs after a "looks good" mark changes.
 */
export const createFeedback = async ({
    host,
    walk_dir,
    ref,
    checkout,
    base_sha,
    github_threads,
    onApprovedChanged,
}: {
    host: WalkHost
    walk_dir: string
    ref: PullRequestRef
    checkout: string
    base_sha: string | null
    github_threads: GitHubThread[]
    onApprovedChanged: () => Promise<void>
}) => {
    let drafts: Drafts = await readDrafts({ walk_dir, ref })
    let shown_base_sha = base_sha

    const error = (text: string) => host.showMessage({ kind: 'error', text })

    const threadOf = (comment: DraftComment): WalkThread | null => {
        if (comment.path === null) return null
        const uri =
            comment.side === 'base'
                ? shown_base_sha === null
                    ? null
                    : baseUri({ path: comment.path, sha: shown_base_sha })
                : checkoutFileUri({ checkout, path: comment.path })
        if (uri === null) return null
        return {
            uri,
            start_line: comment.start_line ?? 1,
            end_line: comment.end_line ?? comment.start_line ?? 1,
            label: DRAFT_LABEL,
            read_only: false,
            comments: [{ author: DRAFT_AUTHOR, body: comment.body }],
            draft_id: comment.id,
        }
    }

    /** A thread already on GitHub, shown read-only where it was left. */
    const githubThreadOf = (thread: GitHubThread): WalkThread | null => {
        const uri =
            thread.side === 'base'
                ? shown_base_sha === null
                    ? null
                    : baseUri({ path: thread.path, sha: shown_base_sha })
                : checkoutFileUri({ checkout, path: thread.path })
        if (uri === null) return null
        return {
            uri,
            start_line: thread.start_line,
            end_line: thread.end_line,
            label: GITHUB_LABEL,
            read_only: true,
            comments: thread.comments,
        }
    }

    const showThreads = () =>
        host.showThreads({
            threads: [
                ...github_threads.map(githubThreadOf),
                ...drafts.comments.map(threadOf),
            ].filter((thread) => thread !== null),
        })

    const update = async (change: (now: Drafts) => Drafts) => {
        drafts = await updateDrafts({ walk_dir, ref, change })
    }

    const keep = async (comment: Omit<DraftComment, 'id'>) => {
        await update((now) => ({
            ...now,
            comments: [...now.comments, { id: randomUUID(), ...comment }],
        }))
        await showThreads()
    }

    /** The open editor's file and side, or null after saying why not. */
    const openFile = async () => {
        const editor = await host.activeEditor()
        const document =
            editor === null ? null : documentOf({ checkout, uri: editor.uri })
        if (editor === null || document === null) {
            await error(`Open a file of #${ref.number} first.`)
            return null
        }
        return { ...document, editor }
    }

    /** Asks with `prompt`; null when cancelled or left empty. */
    const ask = async (prompt: string) => {
        const answer = await host.askText({ prompt })
        return answer === null || answer.trim() === '' ? null : answer
    }

    return {
        showThreads,

        /** Shows `base` side drafts against `sha` from now on, such as the merge base a plain diff reads. */
        showBaseAt: async ({ sha }: { sha: string }) => {
            shown_base_sha = sha
            await showThreads()
        },

        /** Whether the owner marked `path` as looking good. */
        looksGood: (path: string) => drafts.approved_files.includes(path),

        /** The unsent comments, in the order they were made. */
        comments: () => drafts.comments,

        /** The files the owner marked as looking good. */
        approvedFiles: () => drafts.approved_files,

        /** Sets the files marked as looking good to `paths`. */
        setApproved: async ({ paths }: { paths: string[] }) => {
            const same =
                paths.length === drafts.approved_files.length &&
                paths.every((path) => drafts.approved_files.includes(path))
            if (same) return
            await update((now) => ({ ...now, approved_files: paths }))
        },

        /** Clears the comments `ids` once a review took them. */
        clearSent: async ({ ids }: { ids: string[] }) => {
            await update((now) => ({
                ...now,
                comments: now.comments.filter(({ id }) => !ids.includes(id)),
            }))
            await showThreads()
        },

        /** A comment typed in VS Code's comment box on `uri`. */
        draftAdded: async ({
            uri,
            start_line,
            end_line,
            body,
        }: {
            uri: string
            start_line: number
            end_line: number
            body: string
        }) => {
            const document = documentOf({ checkout, uri })
            if (document === null) {
                await error(
                    `Luca Walk keeps comments on the files of #${ref.number} only.`
                )
                return
            }
            await keep({
                kind: 'line',
                path: document.path,
                side: document.side,
                start_line: Math.min(start_line, end_line),
                end_line: Math.max(start_line, end_line),
                body,
            })
        },

        draftEdited: async ({
            draft_id,
            body,
        }: {
            draft_id: string
            body: string
        }) => {
            await update((now) => ({
                ...now,
                comments: now.comments.map((comment) =>
                    comment.id === draft_id ? { ...comment, body } : comment
                ),
            }))
            await showThreads()
        },

        draftDeleted: async ({ draft_id }: { draft_id: string }) => {
            await update((now) => ({
                ...now,
                comments: now.comments.filter(({ id }) => id !== draft_id),
            }))
            await showThreads()
        },

        /** A range comment holding the selected lines as a suggested change. */
        suggestChange: async () => {
            const open = await openFile()
            if (open === null) return
            if (open.side === 'base') {
                await error('Suggestions go on the new side of the diff.')
                return
            }
            const start_line = Math.min(
                open.editor.start_line,
                open.editor.end_line
            )
            const end_line = Math.max(
                open.editor.start_line,
                open.editor.end_line
            )
            let text: string
            try {
                text = await readFile(join(checkout, open.path), 'utf8')
            } catch {
                text = ''
            }
            const lines = text.split('\n').slice(start_line - 1, end_line)
            await keep({
                kind: 'line',
                path: open.path,
                side: 'head',
                start_line,
                end_line,
                body: [`${FENCE}suggestion`, ...lines, FENCE].join('\n'),
            })
        },

        commentOnFile: async () => {
            const open = await openFile()
            if (open === null) return
            const body = await ask(`Comment on ${open.path}`)
            if (body === null) return
            await keep({
                kind: 'file',
                path: open.path,
                side: null,
                start_line: null,
                end_line: null,
                body,
            })
        },

        commentOnPullRequest: async () => {
            const body = await ask(`Comment on #${ref.number}`)
            if (body === null) return
            await keep({
                kind: 'pull_request',
                path: null,
                side: null,
                start_line: null,
                end_line: null,
                body,
            })
        },

        /** Marks the open file as looking good, or clears the mark. */
        toggleLooksGood: async () => {
            const open = await openFile()
            if (open === null) return
            await update((now) => ({
                ...now,
                approved_files: now.approved_files.includes(open.path)
                    ? now.approved_files.filter((path) => path !== open.path)
                    : [...now.approved_files, open.path],
            }))
            await onApprovedChanged()
        },
    }
}

export type Feedback = Awaited<ReturnType<typeof createFeedback>>
