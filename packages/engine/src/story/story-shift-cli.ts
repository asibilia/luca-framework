import { writeFile } from 'node:fs/promises'

import type { Story } from './story-schema'
import { parseShiftDiff, shiftStory, storyLinePaths } from './story-shift'

/**
 * The helper's `shift` command (#738):
 *
 *   bun pr-story.js shift <story.json> <new head sha> [--out <file>] [--repo-dir <dir>]
 *
 * It moves a stale story's line numbers to a newer commit (see
 * `story-shift.ts`) and prints what the new commits touched. It needs a
 * checkout of the repo that has both commits.
 */

/** One `git` call in a folder. */
export type Git = (call: {
    args: string[]
    cwd: string
}) => Promise<{ ok: boolean; stdout: string; stderr: string }>

/** The value after a flag such as `--out`, if the flag was given. */
const flagValue = ({ args, flag }: { args: string[]; flag: string }) => {
    const at = args.indexOf(flag)
    return at === -1 ? undefined : args[at + 1]
}

/**
 * Runs `shift` for a story that was already read and checked.
 *
 * Prints one JSON line: `{ status, from, to, lines_moved, notes }`, with
 * status `shifted` or `unchanged`. The moved story is written to `--out`,
 * or over the story file. `notes` lists everything the new commits edited:
 * the story is not ready to save until its writer has dealt with each one.
 *
 * @returns The exit code: 0 done, 1 the old commit is not an ancestor of
 * the new one (write a new story), 2 a `git` step failed.
 * @example
 * await runShift({ cli, story, path: 'story.json', new_head_sha: 'abc123', args: [] })
 */
export const runShift = async ({
    cli,
    story,
    path,
    new_head_sha,
    args,
}: {
    cli: { git: Git; out: (line: string) => void; err: (line: string) => void }
    story: Story
    /** The story's file; the moved story is written here without `--out`. */
    path: string
    new_head_sha: string
    args: string[]
}): Promise<number> => {
    const cwd = flagValue({ args, flag: '--repo-dir' }) ?? '.'
    const out_path = flagValue({ args, flag: '--out' }) ?? path
    const { git, out, err } = cli
    const resolved = await git({
        args: ['rev-parse', '--verify', '--quiet', `${new_head_sha}^{commit}`],
        cwd,
    })
    if (!resolved.ok) {
        err(
            `Commit ${new_head_sha} is not in the repo at ${cwd}. Fetch it first, or pass --repo-dir.`
        )
        return 2
    }
    const to = resolved.stdout.trim()
    const from = story.head_sha
    if (to === from) {
        out(
            JSON.stringify({
                status: 'unchanged',
                from,
                to,
                lines_moved: 0,
                notes: [],
            })
        )
        return 0
    }
    const ancestor = await git({
        args: ['merge-base', '--is-ancestor', from, to],
        cwd,
    })
    if (!ancestor.ok) {
        err(
            `The story's commit ${from.slice(0, 9)} is not an ancestor of ${to.slice(0, 9)} (a force-push or rebase, or it was never fetched). Write a new story.`
        )
        return 1
    }
    const diff = await git({
        args: [
            '-c',
            'core.quotePath=false',
            'diff',
            '--unified=0',
            '--no-color',
            '--no-renames',
            '--no-ext-diff',
            from,
            to,
            '--',
            ...storyLinePaths({ story }),
        ],
        cwd,
    })
    if (!diff.ok) {
        err(`git diff failed: ${diff.stderr.trim()}`)
        return 2
    }
    const shifted = shiftStory({
        story,
        files: parseShiftDiff({ diff: diff.stdout }),
        new_head_sha: to,
    })
    await writeFile(out_path, `${JSON.stringify(shifted.story, null, 2)}\n`)
    out(
        JSON.stringify({
            status: 'shifted',
            from,
            to,
            lines_moved: shifted.lines_moved,
            notes: shifted.notes,
        })
    )
    err(
        `Wrote ${out_path}: ${shifted.lines_moved} line numbers moved, ${shifted.notes.length} notes.`
    )
    if (shifted.notes.length > 0) {
        err(
            'Each note is something the new commits edited. Rewrite, find again, or recount every one before you save.'
        )
    }
    return 0
}
