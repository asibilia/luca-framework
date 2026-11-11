/**
 * Joins git's three reads of the run branch's diff (its changed files,
 * their line counts, and the diff's text) into one entry per changed file
 * (#743). Pure, and it never throws: git may print more or fewer
 * `diff --git` parts than it lists files (a file↔symlink type change is
 * two parts), so parts are matched to files by their header line.
 */
import type { StoryDiffFile } from './story-diff'

import type { ChangedFile, FileLineCount } from '../git/git-adapter'

/** Git's C-style escapes, as `quote_c_style` writes them. */
const ESCAPES: Record<string, string> = {
    '\u0007': '\\a',
    '\b': '\\b',
    '\t': '\\t',
    '\n': '\\n',
    '\u000b': '\\v',
    '\f': '\\f',
    '\r': '\\r',
    '"': '\\"',
    '\\': '\\\\',
}

const needsQuote = (char: string): boolean =>
    char === '"' || char === '\\' || char < ' ' || char === '\u007f'

/**
 * A name as git writes it in a `diff --git` line with
 * `core.quotepath=false`: as is, or C-quoted when it holds a quote, a
 * backslash or a control character.
 *
 * @example
 * gitName('a/x\ty') // '"a/x\\ty"'
 */
const gitName = (name: string): string => {
    if (![...name].some(needsQuote)) return name
    const body = [...name]
        .map((char) =>
            needsQuote(char)
                ? (ESCAPES[char] ??
                  `\\${char.charCodeAt(0).toString(8).padStart(3, '0')}`)
                : char
        )
        .join('')
    return `"${body}"`
}

/** The `diff --git` line git prints for the file. */
const headerOf = (file: ChangedFile): string =>
    `diff --git ${gitName(`a/${file.previous_path ?? file.path}`)} ${gitName(`b/${file.path}`)}`

const firstLine = (part: string): string => part.split('\n', 1)[0] ?? ''

/**
 * A file's line counts, summed over every `--numstat` entry for its path;
 * `null` (binary) when any entry has none, or when git listed none.
 */
const countsFor = ({
    path,
    counts,
}: {
    path: string
    counts: FileLineCount[]
}): { added: number | null; removed: number | null } => {
    const entries = counts.filter((count) => count.path === path)
    const sum = (key: 'added' | 'removed') =>
        entries.length === 0 || entries.some((entry) => entry[key] === null)
            ? null
            : entries.reduce((total, entry) => total + (entry[key] ?? 0), 0)
    return { added: sum('added'), removed: sum('removed') }
}

/**
 * One entry per changed file, in git's order, with its line counts (by
 * path) and its part of the diff: every `diff --git` part whose header is
 * the file's own, joined in git's order. A file whose header matched no
 * part takes the next part no file claimed, in git's order; with none
 * left, its part is just its header line.
 *
 * @example
 * diffFiles({ changed, counts, text }) // [{ status: 'added', path: 'src/a.ts', added: 3, removed: 0, part: 'diff --git ...' }]
 */
export const diffFiles = ({
    changed,
    counts,
    text,
}: {
    changed: ChangedFile[]
    counts: FileLineCount[]
    text: string
}): StoryDiffFile[] => {
    const parts = text.split(/^(?=diff --git )/m).filter((part) => part !== '')
    const headers = changed.map(headerOf)
    const owner = parts.map((part) => headers.indexOf(firstLine(part)))
    const unclaimed = parts.filter((_, at) => owner[at] === -1)
    return changed.map((file, index) => {
        const own = parts.filter((_, at) => owner[at] === index).join('')
        const part = own === '' ? unclaimed.shift() : own
        return {
            ...file,
            ...countsFor({ path: file.path, counts }),
            part: part ?? `${headers[index]}\n`,
        }
    })
}
