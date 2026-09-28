import { lstat, readlink } from 'node:fs/promises'

/**
 * The text git would store for a path in a worktree, read without ever
 * following a link or failing on an odd path.
 *
 * - A file: its text.
 * - A symlink (to a file, a folder, or nothing): its target, since git keeps
 *   a link as its target, never what it points at.
 * - Anything else (nothing there, a folder, a socket), or a file that can't
 *   be read: `null`.
 *
 * @param path - An absolute path, such as a changed path joined to its
 *   worktree.
 * @returns The path's text, or `null` when it has none.
 *
 * @example
 * await pathText({ path: join(cwd, 'src/sum.ts') }) // 'export const sum = ...'
 * await pathText({ path: join(cwd, 'tools/bin') }) // '/home/me/vendor/bin', a symlinked folder
 */
export const pathText = async ({
    path,
}: {
    path: string
}): Promise<string | null> => {
    try {
        const stat = await lstat(path)
        if (stat.isSymbolicLink()) return await readlink(path)
        if (stat.isFile()) return await Bun.file(path).text()
        return null
    } catch {
        return null
    }
}
