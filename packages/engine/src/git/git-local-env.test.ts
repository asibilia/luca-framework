import { describe, expect, test } from 'bun:test'

import {
    GIT_LOCAL_ENV_VARS,
    gitLocalEnvVars,
    withoutGitLocalEnv,
} from './git-local-env'

/**
 * Git's repo-local environment variables, which `luca check` leaves out of
 * every check's environment (#791).
 */

describe("git's repo-local variables", () => {
    test('are dropped, with the numbered config pairs, and every other variable stays', () => {
        const env = withoutGitLocalEnv({
            source: {
                PATH: '/usr/bin',
                GIT_DIR: '/Users/me/repo/.git',
                GIT_INDEX_FILE: '/Users/me/repo/.git/index',
                GIT_WORK_TREE: '/Users/me/repo',
                GIT_CONFIG_COUNT: '1',
                GIT_CONFIG_KEY_0: 'core.bare',
                GIT_CONFIG_VALUE_0: 'true',
                GIT_SSH_COMMAND: 'ssh -i key',
                GIT_AUTHOR_NAME: 'Me',
                GIT_CONFIG_GLOBAL: '/Users/me/.gitconfig',
                UNSET: undefined,
            },
            local_vars: GIT_LOCAL_ENV_VARS,
        })

        expect(env).toEqual({
            PATH: '/usr/bin',
            GIT_SSH_COMMAND: 'ssh -i key',
            GIT_AUTHOR_NAME: 'Me',
            GIT_CONFIG_GLOBAL: '/Users/me/.gitconfig',
        })
    })

    test("this computer's git list is joined with the built-in one", () => {
        const vars = gitLocalEnvVars()

        for (const name of GIT_LOCAL_ENV_VARS) expect(vars).toContain(name)
        expect(new Set(vars).size).toBe(vars.length)
    })
})
