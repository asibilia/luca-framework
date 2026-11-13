import { execFile } from 'node:child_process'

/**
 * A real `git` for tests (#752): the app's `git` shape, `{ args, cwd }`
 * in and `{ ok, stdout, stderr }` out, with a fixed author so tests can
 * commit, and commit signing off.
 */

export type TestGitResult = { ok: boolean; stdout: string; stderr: string }

/**
 * Runs git in `cwd`. Never throws: a failed command answers `ok` false.
 *
 * @example
 * const head = (await testGit({ args: ['rev-parse', 'HEAD'], cwd })).stdout.trim()
 */
export const testGit = ({
    args,
    cwd,
}: {
    args: string[]
    cwd: string
}): Promise<TestGitResult> =>
    new Promise((resolve) => {
        execFile(
            'git',
            ['-c', 'commit.gpgsign=false', ...args],
            {
                cwd,
                maxBuffer: 64 * 1024 * 1024,
                env: {
                    ...process.env,
                    GIT_AUTHOR_NAME: 'Test',
                    GIT_AUTHOR_EMAIL: 'test@example.com',
                    GIT_COMMITTER_NAME: 'Test',
                    GIT_COMMITTER_EMAIL: 'test@example.com',
                    GIT_TERMINAL_PROMPT: '0',
                },
            },
            (error, stdout, stderr) =>
                resolve({
                    ok: error === null,
                    stdout: String(stdout),
                    stderr: String(stderr),
                })
        )
    })
