/**
 * Where the Claude launcher finds things on disk: the real path of the
 * `claude` binary, the repo's common git dir (shared by its worktrees), and
 * macOS's per-user temp folder.
 */
import { realpathSync } from 'node:fs'
import { isAbsolute } from 'node:path'

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

/** The command that prints macOS's per-user temp folder. */
export const GETCONF_USER_TEMP_DIR = ['getconf', 'DARWIN_USER_TEMP_DIR']

/**
 * The real path of macOS's per-user temp folder (`getconf
 * DARWIN_USER_TEMP_DIR`, such as `/private/var/folders/ab/cd1234/T`), or
 * `null` off macOS, or when `getconf` fails or names no folder there.
 *
 * A sandboxed writer needs it: Foundation stages every atomic write there,
 * not in `$TMPDIR`, so `swift test` and `xcodebuild` can't rebuild without
 * it ("unable to write manifest ... Operation not permitted").
 *
 * @example
 * const user_temp_dir = await darwinUserTempDir({ platform: process.platform, getconf: GETCONF_USER_TEMP_DIR })
 */
export const darwinUserTempDir = async ({
    platform,
    getconf,
}: {
    platform: NodeJS.Platform
    /** The command to ask; the launcher passes `GETCONF_USER_TEMP_DIR`. */
    getconf: string[]
}): Promise<string | null> => {
    if (platform !== 'darwin') return null
    try {
        const result = await runCommand({
            cmd: getconf,
            cwd: '/',
            timeout_ms: 10_000,
        })
        const path = result.stdout.trim()
        if (result.exit_code !== 0 || !isAbsolute(path)) return null
        return realpathSync(path)
    } catch {
        return null
    }
}
