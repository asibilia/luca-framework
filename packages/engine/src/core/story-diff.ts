/**
 * The PR's diff as the story-writer's prompt holds it (#743): one part per
 * changed file, in path order, capped at `STORY_DIFF_CAP` characters. Pure.
 */
import sortBy from 'lodash/sortBy'
import sumBy from 'lodash/sumBy'

import type { DiffFile } from '../git/git-adapter'

/** The most characters the diff part of the story-writer's prompt holds. */
export const STORY_DIFF_CAP = 150_000

/**
 * One changed file of the PR, with its diff part and line counts, as the
 * git module's `diffFiles` gives it.
 */
export type StoryDiffFile = DiffFile

/**
 * Plain code-unit order (JavaScript's `<`), not a locale order.
 *
 * @example
 * ['docs/x.ts', 'README.md'].toSorted(byCodeUnits) // ['README.md', 'docs/x.ts']
 */
export const byCodeUnits = (a: string, b: string): number =>
    a < b ? -1 : a > b ? 1 : 0

/** The files in path order (a rename by its new path). */
export const inPathOrder = <File extends { path: string }>(
    files: File[]
): File[] => files.toSorted((a, b) => byCodeUnits(a.path, b.path))

/** Whether git gave no line counts for the file (`-` in `--numstat`). */
export const isBinary = (file: StoryDiffFile): boolean =>
    file.added === null || file.removed === null

/** A text with one newline at its end. */
const ended = (text: string): string =>
    text.endsWith('\n') ? text : `${text}\n`

/** How a file can show in the diff part. */
type Variants = {
    /** Shown whole. */
    whole: string
    /** Left out: its hunk header lines, then its line counts. */
    left_out: string
    /** Left out with no hunk headers. */
    bare: string
}

const variantsOf = (file: StoryDiffFile): Variants => {
    if (isBinary(file)) {
        const line = `${file.path}: binary file, no diff.\n`
        return { whole: line, left_out: line, bare: line }
    }
    const added = file.added ?? 0
    const counts = `${file.path}: diff left out for size (${added} ${added === 1 ? 'line' : 'lines'} added, ${file.removed ?? 0} removed). Read the file.\n`
    const headers = file.part
        .split('\n')
        .filter((line) => line.startsWith('@@'))
        .map((line) => `${line}\n`)
        .join('')
    return {
        whole: ended(file.part),
        left_out: `${headers}${counts}`,
        bare: counts,
    }
}

/** The line that names the files dropped from the end of the list. */
const droppedLine = (count: number): string =>
    count === 1
        ? '1 more file is not listed here. See ## Changed files.\n'
        : `${count} more files are not listed here. See ## Changed files.\n`

/**
 * The diff part of the story-writer's prompt: every file's part joined, in
 * path order. When the whole diff is over `cap`, files are shown whole
 * smallest first while it fits, the rest left out with their hunk headers
 * and line counts; then hunk headers go, largest file first; then files
 * are dropped from the end, named by a last line. A binary file is always
 * one line.
 *
 * @example
 * storyDiff({ files }) // 'diff --git a/src/a.ts b/src/a.ts\n...'
 */
export const storyDiff = ({
    files,
    cap = STORY_DIFF_CAP,
}: {
    files: StoryDiffFile[]
    cap?: number
}): string => {
    const ordered = inPathOrder(files).map((file) => ({
        file,
        variants: variantsOf(file),
    }))
    const shown = new Map<string, keyof Variants>(
        ordered.map(({ file }) => [file.path, 'whole'])
    )
    const parts = () =>
        ordered.map(
            ({ file, variants }) => variants[shown.get(file.path) ?? 'whole']
        )
    const fits = () => sumBy(parts(), (part) => part.length) <= cap
    if (fits()) return parts().join('')

    const text = ordered.filter(({ file }) => !isBinary(file))
    for (const { file } of text) shown.set(file.path, 'left_out')
    // Smallest first; sortBy keeps equal sizes in path order.
    const bySize = sortBy(text, ({ variants }) => variants.whole.length)
    for (const { file } of bySize) {
        shown.set(file.path, 'whole')
        if (fits()) continue
        shown.set(file.path, 'left_out')
        break
    }
    const largestFirst = sortBy(text, ({ variants }) => -variants.whole.length)
    for (const { file } of largestFirst) {
        if (fits()) break
        shown.set(file.path, 'bare')
    }
    const all = parts()
    if (fits()) return all.join('')

    let kept = 0
    let used = 0
    for (const part of all) {
        const after = all.length - kept - 1
        const last = after === 0 ? '' : droppedLine(after)
        if (used + part.length + last.length > cap) break
        used += part.length
        kept += 1
    }
    const dropped = all.length - kept
    return `${all.slice(0, kept).join('')}${dropped === 0 ? '' : droppedLine(dropped)}`
}
