import { isAbsolute } from 'node:path'

import type { RunCommand } from './board-server-types'

/** The longest `git rev-parse --git-common-dir` may take. */
const GIT_TIMEOUT_MS = 5000

/**
 * Whether a run the plugin didn't start belongs in a workspace (#701): its
 * `repo` and the workspace's folder are the same folder, or two checkouts
 * of one git repo (the same `git rev-parse --git-common-dir`). Git runs
 * through `run_command`, and each folder's answer is kept for the plugin's
 * life. A folder git fails for (not a repo, or gone) matches only itself.
 *
 * @example
 * const { sameRepo } = createRepoMatch({ run_command, env, home_dir })
 * await sameRepo({ directory: '/code/app', repo: '/code/app-wt2' }) // true
 */
export const createRepoMatch = ({
    run_command,
    env,
    home_dir,
}: {
    run_command: RunCommand
    env: Record<string, string | undefined>
    home_dir: string
}) => {
    const common_dirs = new Map<string, Promise<string | null>>()
    const git_env: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) git_env[key] = value
    }

    /** A folder's git common dir, `null` when git fails for it. */
    const commonDirOf = ({ folder }: { folder: string }) => {
        const known = common_dirs.get(folder)
        if (known) return known
        const asked = run_command({
            command: 'git',
            args: [
                '-C',
                folder,
                'rev-parse',
                '--path-format=absolute',
                '--git-common-dir',
            ],
            cwd: home_dir,
            env: git_env,
            timeout_ms: GIT_TIMEOUT_MS,
        }).then(({ exit_code, stdout }) => {
            const path = stdout.trim()
            return exit_code === 0 && isAbsolute(path) ? path : null
        })
        common_dirs.set(folder, asked)
        return asked
    }

    const sameRepo = async ({
        directory,
        repo,
    }: {
        directory: string
        repo: string
    }): Promise<boolean> => {
        if (directory === repo) return true
        const [left, right] = await Promise.all([
            commonDirOf({ folder: directory }),
            commonDirOf({ folder: repo }),
        ])
        return left !== null && left === right
    }

    return { sameRepo }
}
