import { basename, extname } from 'node:path'

import type { LeftoverHit } from './gate-schemas'

import type { FileChange } from '../git/git-adapter'

/** Extensions of files that run or get imported. */
const CODE_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.mjs',
    '.cjs',
    '.sh',
    '.bash',
    '.zsh',
    '.py',
    '.rb',
])

const TOOL_LEFTOVER = /\.(log|orig|rej|bak|swp|swo|tmp|temp)$/i
const SCRATCH_NAME =
    /^(tmp|temp|scratch|scratchpad|debug|notes?|todo)([-_.]|$)/i

/** A new code file's name without its extension, as imports name it. */
export const importStem = (path: string): string =>
    basename(path).replace(/\.[^.]+$/, '')

/** New code files that need a "does anything use this?" answer. */
export const newCodeFiles = ({
    changes,
    test_files,
}: {
    changes: FileChange[]
    test_files: string[]
}): string[] =>
    changes
        .filter(({ change }) => change === 'added')
        .map(({ path }) => path)
        .filter((path) => CODE_EXTENSIONS.has(extname(path).toLowerCase()))
        .filter((path) => !test_files.includes(path))
        .filter((path) => importStem(path) !== 'index')

const nameHit = (path: string): string | null => {
    const name = basename(path)
    if (name === '.DS_Store') return 'a Finder leftover (.DS_Store)'
    if (TOOL_LEFTOVER.test(name) || name.endsWith('~')) {
        return 'a log, backup, or merge leftover'
    }
    if (SCRATCH_NAME.test(name)) return 'a scratch file'
    if (/^junit.*\.xml$/i.test(name) || path.startsWith('coverage/')) {
        return 'test tool output'
    }
    return null
}

/**
 * The leftover scan. Pure: given a worktree's changes, it lists the files the
 * engine must not commit. It runs before every engine commit.
 *
 * Blocks scratch files, logs, `.orig` and other tool leftovers, `.DS_Store`,
 * new markdown the spec and ticket don't name, and new scripts or modules
 * that nothing uses.
 *
 * @param mention_text - The spec's and ticket's text; a new markdown file is
 *   fine if it names the file.
 * @param used_code - For each of `newCodeFiles(...)`, whether another file
 *   mentions it.
 *
 * @example
 * const hits = scanLeftovers({ changes, test_files, mention_text, used_code })
 * if (hits.length > 0) console.error(hits)
 */
export const scanLeftovers = ({
    changes,
    test_files,
    mention_text,
    used_code,
}: {
    changes: FileChange[]
    test_files: string[]
    mention_text: string
    used_code: Record<string, boolean>
}): LeftoverHit[] => {
    const hits: LeftoverHit[] = []
    for (const { path, change } of changes) {
        if (change === 'deleted') continue
        const reason = nameHit(path)
        if (reason !== null) hits.push({ path, reason })
        else if (
            change === 'added' &&
            extname(path).toLowerCase() === '.md' &&
            !mention_text.includes(basename(path))
        ) {
            hits.push({
                path,
                reason: 'a new markdown file the spec and ticket do not name',
            })
        }
    }
    for (const path of newCodeFiles({ changes, test_files })) {
        if (used_code[path] === false) {
            hits.push({
                path,
                reason: 'a new script or module that nothing uses',
            })
        }
    }
    return hits
}
