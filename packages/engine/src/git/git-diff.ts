/**
 * The git adapter's reads of a diff between two commits (#743): their merge
 * base, the diff's text, its changed files with their status, and each
 * file's line counts. None of them changes the repo.
 */
import type { ChangedFile, FileLineCount, GitAdapter } from './git-adapter'
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

export const diffOps: Pick<
    GitAdapter,
    'mergeBase' | 'diffText' | 'changedFiles' | 'lineCounts'
> = {
    mergeBase: async ({ cwd, a, b }) =>
        (await gitOk({ cwd, args: ['merge-base', a, b] })).trim(),
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
