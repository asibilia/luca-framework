import { execFile } from 'node:child_process'

import type { WalkGit } from './walk-host'

import type { Gh } from '../../engine/src/story/story-github'

/**
 * The real `gh` and `git` (#752, section 2), on Node's `child_process`,
 * since the extension runs in VS Code's Node and not in Bun.
 */

type Ran = { ok: boolean; stdout: string; stderr: string }

const runCommand = ({
    file,
    args,
    cwd,
    input,
}: {
    file: string
    args: string[]
    cwd?: string
    input?: string
}): Promise<Ran> =>
    new Promise((resolve) => {
        const child = execFile(
            file,
            args,
            {
                cwd,
                maxBuffer: 64 * 1024 * 1024,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            },
            (error, stdout, stderr) =>
                resolve({
                    ok: error === null,
                    stdout: String(stdout),
                    stderr: String(stderr) || (error?.message ?? ''),
                })
        )
        child.stdin?.end(input ?? '')
    })

/** Runs `gh`, with `input` on its stdin. */
export const realGh: Gh = ({ args, input }) =>
    runCommand({ file: 'gh', args, input })

/** Runs `git` in `cwd`. */
export const realGit: WalkGit = ({ args, cwd }) =>
    runCommand({ file: 'git', args, cwd })
