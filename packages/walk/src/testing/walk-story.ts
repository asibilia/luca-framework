import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

import { testGit } from './test-git'

import type {
    StoryChange,
    StoryStop,
} from '../../../engine/src/story/story-parts'
import type { Story } from '../../../engine/src/story/story-schema'
import {
    story,
    storyChange,
} from '../../../engine/src/story/testing/story-fixtures'

/**
 * Stories and checkouts for the walk's tests (#756): a story built from a
 * short list of stops, and a real git checkout with a base and a head
 * commit for it to point at.
 */

export type ChangeAt = {
    id: string
    path: string
    line: number
    side?: 'head' | 'base'
}

export type StopAt = {
    id: string
    title: string
    loose_ends?: boolean
    changes: ChangeAt[]
}

export type FileAt = {
    path: string
    status: 'added' | 'modified' | 'deleted' | 'renamed'
    previous_path?: string | null
}

/** One valid change at `line` (to `line + 2`) on `side`. */
export const changeAt = ({
    id,
    path,
    line,
    side = 'head',
}: ChangeAt): StoryChange => ({
    ...storyChange({ id, path }),
    side,
    start_line: line,
    end_line: line + 2,
})

const stopOf = ({ id, title, loose_ends, changes }: StopAt): StoryStop => ({
    id,
    kind: loose_ends === true ? 'loose_ends' : 'walk',
    path: loose_ends === true ? null : (changes[0]?.path ?? null),
    title,
    why_here: `Why ${title} is here.`,
    changes: changes.map(changeAt),
})

/**
 * A valid story of `stops` for pull request 12 of `repo`. Every changed
 * file is on the map; `files` sets a file's status (else `modified`).
 */
export const storyOf = ({
    repo,
    base_sha,
    head_sha,
    stops,
    files = [],
}: {
    repo: string
    base_sha: string
    head_sha: string
    stops: StopAt[]
    files?: FileAt[]
}): Story => {
    const built = stops.map(stopOf)
    const paths = [
        ...new Set(
            built.flatMap((stop) => stop.changes.map(({ path }) => path))
        ),
    ]
    const loose = new Set(
        built
            .filter((stop) => stop.kind === 'loose_ends')
            .flatMap((stop) => stop.changes.map(({ path }) => path))
    )
    const statusOf = (path: string) =>
        files.find((file) => file.path === path) ?? {
            path,
            status: 'modified' as const,
        }
    return {
        ...story(),
        repo,
        pr_url: `https://github.com/${repo}/pull/12`,
        base_sha,
        head_sha,
        map: {
            entry_path: built[0]?.path ?? '',
            files: paths.map((path) => ({
                path,
                status: statusOf(path).status,
                previous_path: statusOf(path).previous_path ?? null,
                role: `The role of ${path}.`,
                in_walk: !loose.has(path),
            })),
            links: [],
            architecture_note: 'No new modules.',
        },
        stops: built,
    }
}

const writeFiles = async (root: string, files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) {
        await mkdir(dirname(join(root, path)), { recursive: true })
        await writeFile(join(root, path), text)
    }
}

const commit = async (cwd: string, message: string): Promise<string> => {
    await testGit({ args: ['add', '-A'], cwd })
    await testGit({ args: ['commit', '-q', '-m', message], cwd })
    const head = await testGit({ args: ['rev-parse', 'HEAD'], cwd })
    return head.stdout.trim()
}

/**
 * Makes `folder` a git repo with a base commit holding `base` and a head
 * commit holding `head` (files only in `base` are deleted).
 *
 * @returns The two commits.
 */
export const makeCheckoutRepo = async ({
    folder,
    base,
    head,
}: {
    folder: string
    base: Record<string, string>
    head: Record<string, string>
}): Promise<{ base_sha: string; head_sha: string }> => {
    await mkdir(folder, { recursive: true })
    await testGit({ args: ['init', '-q'], cwd: folder })
    await writeFiles(folder, base)
    const base_sha = await commit(folder, 'base')
    for (const path of Object.keys(base)) {
        if (!(path in head)) await rm(join(folder, path))
    }
    await writeFiles(folder, head)
    const head_sha = await commit(folder, 'head')
    return { base_sha, head_sha }
}

/**
 * Commits, in the repo `folder`, a symlink at `path` to the file `target`
 * by a relative path, as a pull request can, so it may lead out of the
 * checkout.
 *
 * @returns The new head commit.
 */
export const commitSymlink = async ({
    folder,
    path,
    target,
}: {
    folder: string
    path: string
    target: string
}): Promise<string> => {
    const link = join(folder, path)
    await mkdir(dirname(link), { recursive: true })
    await symlink(relative(dirname(link), target), link)
    return commit(folder, `link ${path}`)
}
