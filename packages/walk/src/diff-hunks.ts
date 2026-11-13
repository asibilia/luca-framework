/**
 * What GitHub attaches a comment to (#752, section 11): the hunks of the
 * pull request's diff, read from `git diff --no-color --no-ext-diff -M
 * -U3 <base> <head>`. A line comment is accepted on a line inside a hunk
 * on its side; a range needs both ends inside the same hunk.
 */

/** The lines one hunk covers on one side, both ends included. */
type Lines = { start: number; end: number }

type Hunk = { base: Lines; head: Lines }

/** One file of the diff. */
export type DiffFile = {
    /** Its path at the head (at the base for a deleted file). */
    path: string
    /** Its path at the base (at the head for an added file). */
    previous_path: string
    hunks: Hunk[]
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/** A path from a `---` or `+++` line, or null for `/dev/null`. */
const pathOf = (line: string): string | null => {
    let text = line.slice(4).replace(/\t$/, '')
    if (text === '/dev/null') return null
    if (text.startsWith('"')) {
        try {
            const read: unknown = JSON.parse(text)
            if (typeof read === 'string') text = read
        } catch {
            return null
        }
    }
    return text.replace(/^[ab]\//, '')
}

const linesOf = (start: string | undefined, count: string | undefined) => {
    const first = Number(start)
    const length = count === undefined ? 1 : Number(count)
    return { start: first, end: first + length - 1 }
}

/**
 * The files and hunks of a unified diff. A file with no hunks (binary,
 * or only its mode changed) is left out.
 *
 * @example
 * diffFiles({ output: '--- a/a.ts\n+++ b/a.ts\n@@ -7,7 +7,7 @@\n' })
 * // [{ path: 'a.ts', previous_path: 'a.ts', hunks: [{ base: { start: 7, end: 13 }, head: { start: 7, end: 13 } }] }]
 */
export const diffFiles = ({ output }: { output: string }): DiffFile[] => {
    const files: DiffFile[] = []
    let from: string | null = null
    let current: DiffFile | null = null
    for (const line of output.split('\n')) {
        if (line.startsWith('diff --git ')) {
            current = null
            from = null
        } else if (current === null && line.startsWith('--- ')) {
            from = pathOf(line)
        } else if (current === null && line.startsWith('+++ ')) {
            const to = pathOf(line)
            const path = to ?? from
            if (path === null) continue
            current = { path, previous_path: from ?? path, hunks: [] }
            files.push(current)
        } else if (current !== null) {
            const hunk = HUNK.exec(line)
            if (hunk !== null) {
                current.hunks.push({
                    base: linesOf(hunk[1], hunk[2]),
                    head: linesOf(hunk[3], hunk[4]),
                })
            }
        }
    }
    return files
}

/**
 * The diff's file a comment on `path` is on: on the `head` side by its
 * head path, on the `base` side by its base path, and with no side by
 * either. Null when the file is not in the diff.
 */
export const diffFileOf = ({
    files,
    path,
    side,
}: {
    files: DiffFile[]
    path: string
    side: 'head' | 'base' | null
}): DiffFile | null =>
    files.find((file) =>
        side === 'head'
            ? file.path === path
            : side === 'base'
              ? file.previous_path === path
              : file.path === path || file.previous_path === path
    ) ?? null

/** True when lines `start_line` to `end_line` sit inside one hunk on `side`. */
export const insideHunk = ({
    file,
    side,
    start_line,
    end_line,
}: {
    file: DiffFile
    side: 'head' | 'base'
    start_line: number
    end_line: number
}): boolean =>
    file.hunks.some((hunk) => {
        const lines = hunk[side]
        return (
            lines.start <= start_line &&
            start_line <= end_line &&
            end_line <= lines.end
        )
    })
