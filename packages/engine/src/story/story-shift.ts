import type { StoryChange, StoryFlag } from './story-parts'
import type { Story } from './story-schema'

/**
 * Moving a story's line numbers from the commit it was written for to a
 * newer one (#738). When new commits land, a change the story keeps word
 * for word can still sit on different lines: code was added above it, its
 * test moved, a caller shifted. `shiftStory` moves every line number
 * through the diff between the two commits, and lists what the diff
 * touched, so nothing is left to a careful reread.
 */

/** One hunk of a `git diff --unified=0`: `@@ -old_start,old_count +new_start,new_count @@`. */
export type DiffHunk = {
    old_start: number
    old_count: number
    new_start: number
    new_count: number
}

/** What the new commits did to one file. `gone` means it was deleted. */
export type FileShift = { gone: boolean; hunks: DiffHunk[] }

/** Something `shiftStory` could not move by itself. */
export type ShiftNote = {
    /**
     * - `change_touched`: the new commits edit lines inside this change. Rewrite it.
     * - `change_file_gone`: the change's file was deleted. Rewrite or drop it.
     * - `ref_touched`: a line the change points at (a test, a caller, a flag) was edited. Find it again.
     * - `ref_file_gone`: the file of such a line was deleted. Recount.
     */
    kind:
        | 'change_touched'
        | 'change_file_gone'
        | 'ref_touched'
        | 'ref_file_gone'
    /** The change it belongs to; null for a flag in the summary. */
    change_id: string | null
    where: 'range' | 'proof' | 'blast_radius' | 'flag' | 'summary_flag'
    path: string
    /** The line as the old story had it; null for a whole-file flag. */
    line: number | null
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Reads the output of
 * `git diff --unified=0 --no-color --no-renames --no-ext-diff <old> <new>`
 * into the hunks of every file it names, by path.
 *
 * @example
 * parseShiftDiff({ diff }).get('src/a.ts') // { gone: false, hunks: [{ old_start: 10, old_count: 0, new_start: 11, new_count: 2 }] }
 */
export const parseShiftDiff = ({
    diff,
}: {
    diff: string
}): Map<string, FileShift> => {
    const files = new Map<string, FileShift>()
    let current: FileShift | null = null
    let body_left = 0
    for (const line of diff.split('\n')) {
        // Inside a hunk every line is content, even one that looks like a header.
        if (body_left > 0) {
            if (!line.startsWith('\\')) body_left -= 1
            continue
        }
        if (line.startsWith('diff --git ')) {
            current = null
        } else if (line.startsWith('--- a/')) {
            current = { gone: false, hunks: [] }
            // git ends a name that has a space in it with a tab.
            files.set(line.slice('--- a/'.length).replace(/\t$/, ''), current)
        } else if (line === '+++ /dev/null' && current !== null) {
            current.gone = true
        } else if (current !== null) {
            const hunk = HUNK.exec(line)
            if (hunk === null) continue
            const old_count = Number(hunk[2] ?? 1)
            const new_count = Number(hunk[4] ?? 1)
            current.hunks.push({
                old_start: Number(hunk[1]),
                old_count,
                new_start: Number(hunk[3]),
                new_count,
            })
            body_left = old_count + new_count
        }
    }
    return files
}

/** The first old line after a hunk, and the new line it lands on. */
const afterHunk = ({
    old_start,
    old_count,
    new_start,
    new_count,
}: DiffHunk) => ({
    old_after: old_count > 0 ? old_start + old_count : old_start + 1,
    new_after: new_count > 0 ? new_start + new_count : new_start + 1,
})

/**
 * Where one line of the old file is in the new file. `touched` is true
 * when the line itself was edited or removed; its number is then left
 * alone.
 *
 * @example
 * shiftLine({ line: 44, hunks: [{ old_start: 10, old_count: 0, new_start: 11, new_count: 2 }] }) // { line: 46, touched: false }
 */
export const shiftLine = ({
    line,
    hunks,
}: {
    line: number
    hunks: DiffHunk[]
}): { line: number; touched: boolean } => {
    let offset = 0
    for (const hunk of hunks) {
        const { old_after, new_after } = afterHunk(hunk)
        if (hunk.old_count > 0 && line >= hunk.old_start && line < old_after) {
            return { line, touched: true }
        }
        if (line < old_after) break
        offset = new_after - old_after
    }
    return { line: line + offset, touched: false }
}

/** Whether the new commits edit, remove, or add lines inside `start..end`. */
const rangeTouched = ({
    start,
    end,
    hunks,
}: {
    start: number
    end: number
    hunks: DiffHunk[]
}): boolean =>
    hunks.some(({ old_start, old_count }) =>
        old_count > 0
            ? old_start <= end && old_start + old_count - 1 >= start
            : old_start >= start && old_start < end
    )

/**
 * Moves every line number of a story from the commit it was written for
 * to a newer commit, and sets `head_sha` to that commit.
 *
 * - A change the new commits don't reach keeps its words; its range, its
 *   tests' lines, its callers' lines, and its flags' lines are moved.
 * - Anything the new commits edited is left as it was and listed in
 *   `notes`. A story with notes is not done: each one must be rewritten,
 *   found again, or recounted by its writer before the story is saved.
 * - A `side: "base"` range counts lines of the old file and is left alone.
 *
 * @param files - What the new commits did to each file (see `parseShiftDiff`).
 * @returns The moved story, how many line numbers changed, and the notes.
 * @example
 * const { story: moved, notes } = shiftStory({ story, files: parseShiftDiff({ diff }), new_head_sha })
 */
export const shiftStory = ({
    story,
    files,
    new_head_sha,
}: {
    story: Story
    files: Map<string, FileShift>
    new_head_sha: string
}): { story: Story; lines_moved: number; notes: ShiftNote[] } => {
    const notes: ShiftNote[] = []
    let lines_moved = 0

    /** A line some part of the story points at, moved or noted. */
    const ref = <T extends { path: string; line: number | null }>({
        item,
        change_id,
        where,
    }: {
        item: T
        change_id: string | null
        where: ShiftNote['where']
    }): T => {
        const file = files.get(item.path)
        if (file === undefined) return item
        const note = { change_id, where, path: item.path, line: item.line }
        if (file.gone) {
            notes.push({ kind: 'ref_file_gone', ...note })
            return item
        }
        if (item.line === null) return item
        const moved = shiftLine({ line: item.line, hunks: file.hunks })
        if (moved.touched) {
            notes.push({ kind: 'ref_touched', ...note })
            return item
        }
        if (moved.line !== item.line) lines_moved += 1
        return { ...item, line: moved.line }
    }

    const flags = ({
        list,
        change_id,
    }: {
        list: StoryFlag[]
        change_id: string | null
    }) =>
        list.map((item) =>
            ref({
                item,
                change_id,
                where: change_id === null ? 'summary_flag' : 'flag',
            })
        )

    /** The change's own range, moved or noted. */
    const range = (change: StoryChange) => {
        const { start_line, end_line } = change
        const file = files.get(change.path)
        if (file === undefined || change.side === 'base') {
            return { start_line, end_line }
        }
        const note = {
            change_id: change.id,
            where: 'range' as const,
            path: change.path,
            line: start_line,
        }
        if (file.gone) {
            notes.push({ kind: 'change_file_gone', ...note })
            return { start_line, end_line }
        }
        if (
            rangeTouched({
                start: start_line,
                end: end_line,
                hunks: file.hunks,
            })
        ) {
            notes.push({ kind: 'change_touched', ...note })
            return { start_line, end_line }
        }
        const start = shiftLine({ line: start_line, hunks: file.hunks }).line
        if (start !== start_line) lines_moved += 1
        return { start_line: start, end_line: end_line + start - start_line }
    }

    const change = (old: StoryChange): StoryChange => ({
        ...old,
        ...range(old),
        proof: {
            ...old.proof,
            tests: old.proof.tests.map((item) =>
                ref({ item, change_id: old.id, where: 'proof' })
            ),
        },
        blast_radius: {
            ...old.blast_radius,
            dependents: old.blast_radius.dependents.map((item) =>
                ref({ item, change_id: old.id, where: 'blast_radius' })
            ),
        },
        flags: flags({ list: old.flags, change_id: old.id }),
    })

    return {
        story: {
            ...story,
            head_sha: new_head_sha,
            summary: {
                ...story.summary,
                flags: flags({ list: story.summary.flags, change_id: null }),
            },
            stops: story.stops.map((stop) => ({
                ...stop,
                changes: stop.changes.map(change),
            })),
        },
        lines_moved,
        notes,
    }
}

/** Every path a story's line numbers point into. */
export const storyLinePaths = ({ story }: { story: Story }): string[] => {
    const changes = story.stops.flatMap((stop) => stop.changes)
    return [
        ...new Set([
            ...story.summary.flags.map(({ path }) => path),
            ...changes.flatMap((item) => [
                item.path,
                ...item.proof.tests.map(({ path }) => path),
                ...item.blast_radius.dependents.map(({ path }) => path),
                ...item.flags.map(({ path }) => path),
            ]),
        ]),
    ].toSorted()
}
