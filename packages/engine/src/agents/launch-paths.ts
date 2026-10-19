/**
 * Where the Claude launcher finds things on disk: the real path of the
 * `claude` binary, and the repo's common git dir (shared by its worktrees).
 */
import { realpathSync } from 'node:fs'

import { runCommand } from '../shell/run-command'

export const realClaudePath = (): string => {
    const found = Bun.which('claude')
    if (found === null) throw new Error('No `claude` binary on PATH.')
    return realpathSync(found)
}

export const commonGitDir = async ({
    cwd,
}: {
    cwd: string
}): Promise<string> => {
    const result = await runCommand({
        cmd: ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
        cwd,
        timeout_ms: 30_000,
    })
    if (result.exit_code !== 0) {
        throw new Error(`git rev-parse failed in ${cwd}: ${result.stderr}`)
    }
    return realpathSync(result.stdout.trim())
}
