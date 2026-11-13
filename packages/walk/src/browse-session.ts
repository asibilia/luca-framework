import type { PullRequestRef } from './pull-request-ref'
import type { WalkGit, WalkHost } from './walk-host'
import { createWalkPlace } from './walk-place'
import type { WalkSession } from './walk-session'
import { baseUri, checkoutFileUri } from './walk-uris'
import { page, paragraph } from './webview-html'

/**
 * Browsing without a story (#752, section 9): one stop per changed file,
 * from `git diff --name-status -M` between the merge base and the head,
 * walked with the same commands and the same place as a story's walk.
 */

const NO_STORY =
    'No story: this is the plain diff. Use "Write the story" for a guided walk.'

/** One changed file: its status letter, its path and, for a rename, its old path. */
type ChangedFile = { status: string; path: string; previous_path: string }

/**
 * The changed files of `git diff --name-status -z` output.
 *
 * @example
 * changedFiles({ output: 'M\0README.md\0R100\0a.ts\0b.ts\0' })
 * // [{ status: 'M', path: 'README.md', previous_path: 'README.md' }, { status: 'R', path: 'b.ts', previous_path: 'a.ts' }]
 */
export const changedFiles = ({ output }: { output: string }): ChangedFile[] => {
    const parts = output.split('\0').filter((part) => part !== '')
    const files: ChangedFile[] = []
    let at = 0
    while (at < parts.length) {
        const status = (parts[at] ?? '').charAt(0)
        const two = status === 'R' || status === 'C'
        const first = parts[at + 1] ?? ''
        const path = two ? (parts[at + 2] ?? first) : first
        files.push({ status, path, previous_path: two ? first : path })
        at += two ? 3 : 2
    }
    return files.toSorted((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0
    )
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/m

/** The line and side of a file's first diff hunk; line 1 when it has none. */
const firstHunk = ({
    diff,
    deleted,
}: {
    diff: string
    deleted: boolean
}): { line: number; side: 'head' | 'base' } => {
    const side = deleted ? 'base' : 'head'
    const hunk = HUNK.exec(diff)
    if (hunk === null) return { line: 1, side }
    const line = Number(deleted ? hunk[1] : hunk[3])
    return { line: Math.max(line, 1), side }
}

/**
 * A plain-diff session for the checkout at `checkout`, with the same
 * commands as a story's walk. Null, after showing why, when git can't
 * read the diff.
 */
export const createBrowseSession = async ({
    host,
    git,
    walk_dir,
    ref,
    checkout,
    base_sha,
    head_sha,
    looksGood,
    files_to_walk = null,
    last_review = null,
}: {
    host: WalkHost
    git: WalkGit
    walk_dir: string
    ref: PullRequestRef
    checkout: string
    /** The commit the diff's base side is read at: the loaded pull request's merge base. */
    base_sha: string
    head_sha: string
    /** Whether the owner marked the file `path` as looking good. */
    looksGood: (path: string) => boolean
    /**
     * On a second visit, the files changed since the last review: only
     * their stops are walked. Null walks all.
     */
    files_to_walk?: string[] | null
    /** The last review's commit; null when there was none. */
    last_review?: string | null
}): Promise<WalkSession | null> => {
    const listed = await git({
        args: ['diff', '--name-status', '-M', '-z', base_sha, head_sha],
        cwd: checkout,
    })
    if (!listed.ok) {
        await host.showMessage({
            kind: 'error',
            text: `Luca Walk could not read the diff of #${ref.number}: ${listed.stderr.trim() || 'git failed'}`,
        })
        return null
    }
    const files = changedFiles({ output: listed.stdout })
    const place = await createWalkPlace({
        host,
        walk_dir,
        ref,
        last_review,
        stops: files.map((file) => ({
            id: file.path,
            change_ids: [],
            to_walk:
                files_to_walk === null ||
                files_to_walk.includes(file.path) ||
                files_to_walk.includes(file.previous_path),
            file,
        })),
    })

    const showStops = () =>
        host.showStops({
            items: files.map((file, at) => ({
                label: `${at + 1}. ${file.path}`,
                description: place.descriptionOf({
                    id: file.path,
                    looks_good: looksGood(file.path),
                }),
                stop_id: file.path,
            })),
        })

    const showContext = () =>
        host.showContext({
            html: page({
                title: 'Context',
                body: paragraph({ text: NO_STORY }),
            }),
        })

    const openFile = async ({ file }: { file: ChangedFile }) => {
        const deleted = file.status === 'D'
        const paths =
            file.previous_path === file.path
                ? [file.path]
                : [file.previous_path, file.path]
        const diff = await git({
            args: [
                'diff',
                '--no-color',
                '--no-ext-diff',
                '-M',
                '-U0',
                base_sha,
                head_sha,
                '--',
                ...paths,
            ],
            cwd: checkout,
        })
        const { line, side } = firstHunk({
            diff: diff.ok ? diff.stdout : '',
            deleted,
        })
        // An added file's base side names the merge base too: the file is
        // not there, so its document reads as empty.
        await host.openDiff({
            title: `${file.path} (#${ref.number})`,
            base_uri: baseUri({ path: file.previous_path, sha: base_sha }),
            head_uri: deleted
                ? baseUri({ path: file.path, sha: null })
                : checkoutFileUri({ checkout, path: file.path }),
            reveal_line: line,
            reveal_side: side,
        })
        await showContext()
    }

    const goToFile = async (placed: { file: ChangedFile } | null) => {
        if (placed === null) return
        await place.enter({ id: placed.file.path, change_id: null })
        await showStops()
        await openFile(placed)
    }

    const fileOf = ({ path }: { path: string }) => {
        const file = files.find((changed) => changed.path === path)
        return file === undefined ? null : { file }
    }

    const start = async () => goToFile(await place.first())

    return {
        showStops,
        start,
        nextStop: async () => goToFile(await place.along({ step: 1 })),
        previousStop: async () => goToFile(await place.along({ step: -1 })),
        /** The plain diff has no story changes to move through. */
        nextChange: async () => undefined,
        previousChange: async () => undefined,
        backToWalk: async () => {
            const current = place.current()
            if (current === null) return start()
            await openFile(current)
        },
        pickStop: async ({ stop_id }: { stop_id: string }) =>
            goToFile(fileOf({ path: stop_id })),
        /** The plain diff has no story, so no map. */
        story: null,
        goToFile: async ({ path }: { path: string }) =>
            goToFile(fileOf({ path })),
        cursorMoved: async () => undefined,
    }
}
