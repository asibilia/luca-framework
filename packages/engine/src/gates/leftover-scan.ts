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
const SCRATCH_REASON = 'a scratch file'

/**
 * Files a tool or framework loads by name, so nothing imports them: tool
 * configs (`vite.config.ts`, `eslint.config.mjs`), framework entry, root,
 * routes, and middleware files, and anything in a file-based router's
 * folder.
 */
const LOADED_BY_NAME = [
    /\.config\.(ts|js|mjs|cjs|mts|cts)$/i,
    /^entry\.(server|client)\./i,
    /^(root|routes|middleware)\./i,
]
const ROUTER_FOLDER = /(^|\/)(app\/routes|pages|src\/app|src\/pages)\//

/**
 * A changeset an agent wrote: a new markdown file in `.changeset/` other than
 * its README. The engine writes the run's one changeset itself.
 */
export const isAgentChangeset = ({ path, change }: FileChange): boolean =>
    change === 'added' &&
    /^\.changeset\/[^/]+\.md$/.test(path) &&
    basename(path) !== 'README.md'

/** Whether a tool or framework loads this file by its name or folder. */
const loadedByName = (path: string): boolean =>
    LOADED_BY_NAME.some((pattern) => pattern.test(basename(path))) ||
    ROUTER_FOLDER.test(path)

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
        .filter((path) => !loadedByName(path))

/**
 * Files the "named by the repo" rule can clear: scratch-named files and new
 * code files. Each needs a "does a tracked or newly added non-test file
 * name it?" answer.
 */
export const nameCheckFiles = ({
    changes,
    test_files,
}: {
    changes: FileChange[]
    test_files: string[]
}): string[] => [
    ...new Set([
        ...changes
            .filter(({ change }) => change !== 'deleted')
            .map(({ path }) => path)
            .filter((path) => SCRATCH_NAME.test(basename(path))),
        ...newCodeFiles({ changes, test_files }),
    ]),
]

const nameHit = (path: string): string | null => {
    // git lists a folder with its own repo as one path ending in a slash.
    if (path.endsWith('/')) {
        return 'a folder with its own git repo in it, which git cannot commit as files'
    }
    const name = basename(path)
    if (name === '.DS_Store') return 'a Finder leftover (.DS_Store)'
    if (TOOL_LEFTOVER.test(name) || name.endsWith('~')) {
        return 'a log, backup, or merge leftover'
    }
    if (SCRATCH_NAME.test(name)) return SCRATCH_REASON
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
 * new markdown the spec and ticket don't name, new scripts or modules
 * that nothing uses, and a folder with its own git repo in it (which
 * `git add` can't take as files). A file a tool or framework loads by name
 * (`*.config.*`, `entry.server.*`, a route file) is never "unused", and a
 * file the repo names is neither "unused" nor scratch.
 *
 * @param mention_text - The spec's and ticket's text; a new markdown file is
 *   fine if it names the file.
 * @param used_code - For each of `newCodeFiles(...)`, whether another file
 *   mentions it.
 * @param named - Those of `nameCheckFiles(...)` whose basename a tracked or
 *   newly added non-test file names (a TOC, `package.json`, a config).
 *
 * @example
 * const hits = scanLeftovers({ changes, test_files, mention_text, used_code, named })
 * if (hits.length > 0) console.error(hits)
 */
export const scanLeftovers = ({
    changes,
    test_files,
    mention_text,
    used_code,
    named = [],
}: {
    changes: FileChange[]
    test_files: string[]
    mention_text: string
    used_code: Record<string, boolean>
    named?: string[]
}): LeftoverHit[] => {
    const hits: LeftoverHit[] = []
    for (const { path, change } of changes) {
        if (change === 'deleted') continue
        const hit = nameHit(path)
        // A module the repo names, such as a TOC's `debug.lua`, isn't scratch.
        const reason =
            hit === SCRATCH_REASON && named.includes(path) ? null : hit
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
        if (used_code[path] === false && !named.includes(path)) {
            hits.push({
                path,
                reason: 'a new script or module that nothing uses',
            })
        }
    }
    return hits
}
