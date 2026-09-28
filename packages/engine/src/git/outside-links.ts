import { lstat, readlink, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import uniq from 'lodash/uniq'

/** Whether `target` is `root` or somewhere under it. */
const isInside = ({ root, target }: { root: string; target: string }) => {
    const path = relative(root, target)
    return (
        path === '' ||
        (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
    )
}

/**
 * The paths among `paths` that are symlinks pointing outside the checkout
 * at `cwd`, such as a build's link to a vendor folder in the owner's own
 * checkout. Such a link only works on one machine, so no commit should hold
 * it. A link's target is read, never followed; a relative target counts
 * from the link's folder. A path that is not a link, or can't be read, is
 * never one.
 *
 * @param cwd - The checkout's root.
 * @param paths - Checkout-relative paths, as git lists them.
 * @returns The outside-pointing links, in the order given.
 *
 * @example
 * await outsideLinks({ cwd, paths: ['tools/bin', 'src/sum.ts'] })
 * // ['tools/bin'], when tools/bin links to /home/me/vendor/bin
 */
export const outsideLinks = async ({
    cwd,
    paths,
}: {
    cwd: string
    paths: string[]
}): Promise<string[]> => {
    // A link may name the checkout by its real path (macOS's /private/var
    // for /var, say), so both count as inside.
    const roots = uniq([resolve(cwd), await realpath(cwd).catch(() => cwd)])
    const found: string[] = []
    for (const path of paths) {
        const full = join(cwd, path)
        const target = await lstat(full)
            .then(async (stat) =>
                stat.isSymbolicLink()
                    ? resolve(dirname(full), await readlink(full))
                    : null
            )
            .catch(() => null)
        if (target === null) continue
        if (!roots.some((root) => isInside({ root, target }))) found.push(path)
    }
    return found
}
