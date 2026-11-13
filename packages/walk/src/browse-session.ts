import { readDrafts, saveWalkPlace, type WalkPlace } from './drafts-file'
import type { PullRequestRef } from './pull-request-ref'
import type { WalkGit, WalkHost } from './walk-host'
import type { WalkSession } from './walk-session'
import { baseUri, checkoutFileUri } from './walk-uris'
import { page, paragraph } from './webview-html'

/**
 * Browsing without a story (#752, section 9): one stop per changed file,
 * from `git diff --name-status -M` between the merge base and the head,
 * walked with the same commands as a story's walk.
 */

const NO_STORY =
    'No story: this is the plain diff. Use "Write the story" for a guided walk.'

const LAST_STOP = "That was the last stop. Send the review when you're ready."

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
    base_ref,
    head_sha,
    looksGood,
    onBaseSha,
}: {
    host: WalkHost
    git: WalkGit
    walk_dir: string
    ref: PullRequestRef
    checkout: string
    base_ref: string
    head_sha: string
    /** Whether the owner marked the file `path` as looking good. */
    looksGood: (path: string) => boolean
    /** Told the merge base the diff's base side is read at. */
    onBaseSha: (base_sha: string) => Promise<void>
}): Promise<WalkSession | null> => {
    const failed = async (stderr: string) => {
        await host.showMessage({
            kind: 'error',
            text: `Luca Walk could not read the diff of #${ref.number}: ${stderr.trim() || 'git failed'}`,
        })
        return null
    }
    const merged = await git({
        args: ['merge-base', `origin/${base_ref}`, head_sha],
        cwd: checkout,
    })
    if (!merged.ok) return failed(merged.stderr)
    const base_sha = merged.stdout.trim()
    await onBaseSha(base_sha)
    const listed = await git({
        args: ['diff', '--name-status', '-M', '-z', base_sha, head_sha],
        cwd: checkout,
    })
    if (!listed.ok) return failed(listed.stderr)
    const files = changedFiles({ output: listed.stdout })
    const fileOf = (id: string | null) =>
        files.find(({ path }) => path === id) ?? null

    const saved = (await readDrafts({ walk_dir, ref })).walk
    let place: WalkPlace = {
        current_stop_id: fileOf(saved.current_stop_id)?.path ?? null,
        done_stop_ids: saved.done_stop_ids.filter((id) => fileOf(id) !== null),
        last_change_id: null,
    }
    let saving: Promise<void> = Promise.resolve()
    const save = () => {
        const walk = place
        saving = saving
            .catch(() => undefined)
            .then(() => saveWalkPlace({ walk_dir, ref, walk }))
        return saving
    }

    const showStops = () =>
        host.showStops({
            items: files.map((file, at) => ({
                label: `${at + 1}. ${file.path}`,
                description: [
                    file.path === place.current_stop_id
                        ? 'current'
                        : place.done_stop_ids.includes(file.path)
                          ? 'done'
                          : '',
                    looksGood(file.path) ? 'looks good' : '',
                ]
                    .filter((part) => part !== '')
                    .join(' · '),
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

    const openFile = async (file: ChangedFile) => {
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

    const goToFile = async (file: ChangedFile) => {
        const left = place.current_stop_id
        const done =
            left === null ||
            left === file.path ||
            place.done_stop_ids.includes(left)
                ? place.done_stop_ids
                : [...place.done_stop_ids, left]
        place = {
            current_stop_id: file.path,
            done_stop_ids: done,
            last_change_id: null,
        }
        await save()
        await showStops()
        await openFile(file)
    }

    const start = async () => {
        const [first] = files
        if (first !== undefined) await goToFile(first)
    }

    const moveStop = async (step: 1 | -1) => {
        const file = fileOf(place.current_stop_id)
        if (file === null) return start()
        const to = files[files.indexOf(file) + step]
        if (to !== undefined) return goToFile(to)
        if (step === 1) {
            await host.showMessage({ kind: 'info', text: LAST_STOP })
        }
    }

    const backToWalk = async () => {
        const file = fileOf(place.current_stop_id)
        if (file === null) return start()
        await openFile(file)
    }

    return {
        showStops,
        start,
        nextStop: () => moveStop(1),
        previousStop: () => moveStop(-1),
        /** The plain diff has no story changes to move through. */
        nextChange: async () => undefined,
        previousChange: async () => undefined,
        backToWalk,
        pickStop: async ({ stop_id }: { stop_id: string }) => {
            const file = fileOf(stop_id)
            if (file !== null) await goToFile(file)
        },
        /** The plain diff has no story, so no map. */
        story: null,
        goToFile: async ({ path }: { path: string }) => {
            const file = fileOf(path)
            if (file !== null) await goToFile(file)
        },
        cursorMoved: async () => undefined,
    }
}
