/**
 * Git's repo-local environment variables, and an environment without them
 * (#791). Inside a git hook, git exports `GIT_DIR` and friends. A check run
 * with them, such as a test that makes a scratch repo with `git init` and
 * `git commit` in a temp folder, would write to the real repo instead:
 * its config, its branch and its tags. `luca check` runs every check
 * without them.
 *
 * Only the repo-local ones go: the list `git rev-parse --local-env-vars`
 * prints, plus the numbered `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>`
 * pairs that go with `GIT_CONFIG_COUNT`. Every other `GIT_*` stays, since it
 * is the person's own setting and names no repo: `GIT_SSH_COMMAND`,
 * `GIT_ASKPASS`, `GIT_AUTHOR_*` and `GIT_COMMITTER_*`, `GIT_CONFIG_GLOBAL`,
 * `GIT_EXEC_PATH`, `GIT_TERMINAL_PROMPT` and the rest.
 */

/**
 * What `git rev-parse --local-env-vars` prints (git 2.55), used when git
 * can't be asked and joined with its answer when it can, so a newer git's
 * additions are dropped too.
 */
export const GIT_LOCAL_ENV_VARS = [
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_COUNT',
    'GIT_OBJECT_DIRECTORY',
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_IMPLICIT_WORK_TREE',
    'GIT_GRAFT_FILE',
    'GIT_INDEX_FILE',
    'GIT_NO_REPLACE_OBJECTS',
    'GIT_REPLACE_REF_BASE',
    'GIT_PREFIX',
    'GIT_SHALLOW_FILE',
    'GIT_COMMON_DIR',
]

/** The `GIT_CONFIG_COUNT` pairs: `GIT_CONFIG_KEY_0`, `GIT_CONFIG_VALUE_0`, ... */
const CONFIG_PAIR = /^GIT_CONFIG_(KEY|VALUE)_\d+$/

/**
 * `source` without git's repo-local variables (`local_vars`, and the
 * numbered config pairs), and without unset ones. Pure.
 *
 * @example
 * withoutGitLocalEnv({ source: { PATH: '/usr/bin', GIT_DIR: '/r/.git', GIT_SSH_COMMAND: 'ssh' }, local_vars: GIT_LOCAL_ENV_VARS })
 * // { PATH: '/usr/bin', GIT_SSH_COMMAND: 'ssh' }
 */
export const withoutGitLocalEnv = ({
    source,
    local_vars,
}: {
    source: Record<string, string | undefined>
    local_vars: string[]
}): Record<string, string> => {
    const drop = new Set(local_vars)
    const env: Record<string, string> = {}
    for (const [name, value] of Object.entries(source)) {
        if (value === undefined || drop.has(name) || CONFIG_PAIR.test(name)) {
            continue
        }
        env[name] = value
    }
    return env
}

/**
 * Git's repo-local variable names: `GIT_LOCAL_ENV_VARS` joined with what
 * this computer's git prints for `git rev-parse --local-env-vars`, which
 * needs no repo. With no git to ask, the list alone.
 */
export const gitLocalEnvVars = (): string[] => {
    let asked: string[] = []
    try {
        const out = Bun.spawnSync(['git', 'rev-parse', '--local-env-vars'], {
            env: withoutGitLocalEnv({
                source: process.env,
                local_vars: GIT_LOCAL_ENV_VARS,
            }),
        })
        if (out.exitCode === 0) {
            asked = out.stdout
                .toString()
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => /^GIT_[A-Z0-9_]+$/.test(line))
        }
    } catch {
        // No git on the PATH: the built-in list is enough.
    }
    return [...new Set([...GIT_LOCAL_ENV_VARS, ...asked])]
}

/**
 * This process's environment without git's repo-local variables, to pass
 * as `env:` to a child. It must be passed explicitly: a Bun spawn with no
 * `env` option doesn't see keys deleted from `process.env` (#791).
 */
export const cleanGitEnv = (): Record<string, string> =>
    withoutGitLocalEnv({ source: process.env, local_vars: gitLocalEnvVars() })
