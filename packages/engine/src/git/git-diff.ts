/**
 * The git adapter's reads of a diff between two commits (#743): their merge
 * base, the diff's text, its changed files with their status, and each
 * file's line counts. None of them changes the repo. Every parser of their
 * output lives here too, next to the args that keep it stable.
 */
import type {
    ChangedFile,
    DiffFile,
    FileLineCount,
    GitAdapter,
} from './git-adapter'
import { gitOk } from './git-run'

/**
 * Splits `git ... -z` output into its fields.
 *
 * @example
 * zFields('M\0src/a.ts\0') // ['M', 'src/a.ts']
 */
const zFields = (text: string): string[] =>
    text.split('\0').filter((field) => field !== '')

/**
 * Parses `git diff --name-status -z -M`, in git's order. Renames name the
 * new path; any status but added, deleted or renamed is modified (a copy,
 * which `-M` never finds, by its new path).
 */
export const parseNameStatus = ({ text }: { text: string }): ChangedFile[] => {
    const fields = zFields(text)
    const files: ChangedFile[] = []
    for (let at = 0; at < fields.length; at += 1) {
        const status = fields[at] ?? ''
        if (status.startsWith('R') || status.startsWith('C')) {
            const previous_path = fields[at + 1] ?? ''
            const path = fields[at + 2] ?? ''
            at += 2
            files.push(
                status.startsWith('R')
                    ? { status: 'renamed', path, previous_path }
                    : { status: 'modified', path, previous_path: null }
            )
            continue
        }
        const path = fields[at + 1] ?? ''
        at += 1
        files.push({
            status:
                status === 'A'
                    ? 'added'
                    : status === 'D'
                      ? 'deleted'
                      : 'modified',
            path,
            previous_path: null,
        })
    }
    return files
}

/** A count from `--numstat`: a number, or `null` for a binary file's `-`. */
const countOf = (text: string): number | null =>
    text === '-' ? null : Number(text)

/**
 * Parses `git diff --numstat -z -M`, in git's order. A rename goes by its
 * new path.
 */
export const parseNumstat = ({ text }: { text: string }): FileLineCount[] => {
    const fields = zFields(text)
    const counts: FileLineCount[] = []
    for (let at = 0; at < fields.length; at += 1) {
        const [added = '', removed = '', ...rest] = (fields[at] ?? '').split(
            '\t'
        )
        const inline = rest.join('\t')
        const path = inline === '' ? (fields[at + 2] ?? '') : inline
        if (inline === '') at += 2
        counts.push({ path, added: countOf(added), removed: countOf(removed) })
    }
    return counts
}

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
 * `core.quotepath=false` (set by `diffText`): as is, or C-quoted when it
 * holds a quote, a backslash or a control character.
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

/**
 * The `diff --git` line `diffText` prints for the file, with the `a/` and
 * `b/` prefixes it sets.
 */
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
 * Joins the adapter's three reads of one diff (`changedFiles`,
 * `lineCounts`, `diffText`) into one entry per changed file, in git's
 * order. Pure, and it never throws: git may print more or fewer
 * `diff --git` parts than it lists files (a file↔symlink type change is
 * two parts), so parts are matched to files by their header line. A file's
 * part is every part whose header is its own, joined in git's order. A
 * file whose header matched no part takes the next part no file claimed,
 * in git's order; with none left, its part is just its header line.
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
}): DiffFile[] => {
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

export const diffOps: Pick<
    GitAdapter,
    'mergeBase' | 'diffText' | 'changedFiles' | 'lineCounts'
> = {
    mergeBase: async ({ cwd, a, b }) =>
        (await gitOk({ cwd, args: ['merge-base', a, b] })).trim(),
    // `diffFiles` matches this text's `diff --git` lines by rebuilding them
    // (`headerOf`): keep `core.quotepath=false` and the `a/` and `b/`
    // prefixes in step with `gitName` and `headerOf`.
    diffText: ({ cwd, from, to }) =>
        gitOk({
            cwd,
            args: [
                '-c',
                'core.quotepath=false',
                'diff',
                '--no-color',
                '--no-ext-diff',
                '-M',
                '-U3',
                '--no-textconv',
                '--src-prefix=a/',
                '--dst-prefix=b/',
                '--diff-algorithm=myers',
                // A submodule always gets its `diff --git` line, whatever `diff.submodule` says.
                '--submodule=short',
                from,
                to,
            ],
        }),
    changedFiles: async ({ cwd, from, to }) =>
        parseNameStatus({
            text: await gitOk({
                cwd,
                args: ['diff', '--name-status', '-z', '-M', from, to],
            }),
        }),
    lineCounts: async ({ cwd, from, to }) =>
        parseNumstat({
            text: await gitOk({
                cwd,
                args: ['diff', '--numstat', '-z', '-M', from, to],
            }),
        }),
}
