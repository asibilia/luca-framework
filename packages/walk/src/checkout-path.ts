import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

/**
 * Keeping a story's paths in the checkout (#752, section 6): a story is
 * read from GitHub, so a planted one could name `../../.ssh/id_rsa`, an
 * absolute path, or a committed symlink that leads out of the checkout.
 * The walk opens none of those.
 */

/** True when `path` has no `..` part and is not absolute. */
export const isPlainRepoPath = ({ path }: { path: string }): boolean =>
    path !== '' &&
    !isAbsolute(path) &&
    !path.split(/[/\\]/).some((part) => part === '..')

/**
 * The real path of `file`, symlinks followed; for a file that doesn't
 * exist, its nearest existing folder's real path with the rest joined on.
 * Null when not even the root can be read.
 */
const realPathOf = async (file: string): Promise<string | null> => {
    try {
        return await realpath(file)
    } catch {
        const parent = dirname(file)
        if (parent === file) return null
        const real = await realPathOf(parent)
        return real === null ? null : join(real, basename(file))
    }
}

/**
 * True when the story's `path` names a file inside `checkout`, symlinks
 * followed: no `..` part, not absolute, and its real path under the
 * checkout's real path.
 *
 * @example
 * await staysInCheckout({ checkout, path: 'src/a.ts' }) // true
 * await staysInCheckout({ checkout, path: '../../secret.ts' }) // false
 */
export const staysInCheckout = async ({
    checkout,
    path,
}: {
    checkout: string
    path: string
}): Promise<boolean> => {
    if (!isPlainRepoPath({ path })) return false
    const [root, real] = await Promise.all([
        realPathOf(checkout),
        realPathOf(join(checkout, path)),
    ])
    if (root === null || real === null) return false
    const inside = relative(root, real)
    return (
        inside !== '' &&
        inside !== '..' &&
        !inside.startsWith(`..${sep}`) &&
        !isAbsolute(inside)
    )
}
