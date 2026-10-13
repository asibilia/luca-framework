import { mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'

import { $ } from 'bun'

/** The folders a skill helper can be started from, for one repo and none. */
export type Checkouts = {
    /** The main checkout: where a run's `run_started` repo points. */
    main: string
    /** A `git worktree add` of the main checkout. */
    worktree: string
    /** A folder inside the main checkout. */
    subfolder: string
    /** A symlink to the main checkout. */
    link: string
    /** A folder in no git repo. */
    outside: string
}

/**
 * Real throwaway checkouts under `dir`: a git repo with one commit, a
 * worktree of it, a subfolder, a symlink to it, and a folder outside git.
 * For the `/luca-unstick` and `/luca-retro` helpers' repo lookup, which must
 * find the same runs from each of them.
 *
 * @example
 * const { main, worktree } = await makeCheckouts({ dir })
 */
export const makeCheckouts = async ({
    dir,
}: {
    dir: string
}): Promise<Checkouts> => {
    const main = join(dir, 'app')
    const worktree = join(dir, 'app-worktree')
    const subfolder = join(main, 'src', 'deep')
    const link = join(dir, 'app-link')
    const outside = join(dir, 'not-git')
    await mkdir(subfolder, { recursive: true })
    await mkdir(outside, { recursive: true })
    await Bun.write(join(subfolder, 'a.txt'), 'a\n')
    await $`git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -qm init`
        .cwd(main)
        .quiet()
    await $`git worktree add -q -b side ${worktree}`.cwd(main).quiet()
    await symlink(main, link)
    return { main, worktree, subfolder, link, outside }
}
