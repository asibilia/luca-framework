/**
 * Runs `git` in a folder: `gitRun` returns the result as it is, `gitOk`
 * throws when git fails. Also the line splitter and `head` the other git
 * modules share.
 */
import { runCommand } from '../shell/run-command'

export const gitRun = ({ cwd, args }: { cwd: string; args: string[] }) =>
    runCommand({ cmd: ['git', ...args], cwd, timeout_ms: 120_000 })

export const gitOk = async ({
    cwd,
    args,
}: {
    cwd: string
    args: string[]
}): Promise<string> => {
    const result = await gitRun({ cwd, args })
    if (result.exit_code !== 0) {
        throw new Error(
            `git ${args.join(' ')} failed in ${cwd}:\n${result.stderr || result.stdout}`
        )
    }
    return result.stdout
}

export const lines = (text: string): string[] =>
    text.split('\n').filter((line) => line.trim() !== '')

/** The commit checked out at `cwd`. */
export const head = async ({ cwd }: { cwd: string }) =>
    (await gitOk({ cwd, args: ['rev-parse', 'HEAD'] })).trim()
