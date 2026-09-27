/**
 * `luca setup`: gets the repo in the current folder ready for Luca. Run it
 * inside the target repo, as often as you like:
 *
 *   luca setup [--base <branch>]
 *
 * It creates the labels a run needs, writes or converts `.luca/config.json`
 * (a new-style one is left alone), checks the `gh` login, the GitHub remote,
 * sub-issues and issue dependencies, the base branch (default `main`) on
 * `origin`, and the memory vault, and prints what's done and what's left,
 * with `luca doctor`'s repo checks. It never commits. See `runSetup`.
 *
 * Exits 0 when nothing is left to do, 1 when there is, 2 on bad flags.
 */
import { githubOf, memoryOf } from './repo-adapters-real'
import { runSetup } from './setup'

/** `luca setup`'s usage line. */
export const SETUP_USAGE = 'Usage: luca setup [--base <branch>]'

const parseBase = (argv: string[]): string | null => {
    if (argv.length === 0) return 'main'
    const [flag, base] = argv
    return flag === '--base' &&
        argv.length === 2 &&
        base !== undefined &&
        base !== ''
        ? base
        : null
}

/** Runs `luca setup` with the flags after `setup`; returns the exit code. */
export const setupCommand = async ({
    argv,
}: {
    argv: string[]
}): Promise<number> => {
    const base_branch = parseBase(argv)
    if (base_branch === null) {
        console.error(SETUP_USAGE)
        return 2
    }
    const cwd = process.cwd()
    const memory = await memoryOf()
    try {
        const end = await runSetup({
            repo: cwd,
            github: await githubOf({ cwd }),
            memory,
            base_branch,
            log: (line) => {
                console.log(line)
            },
        })
        return end.ok ? 0 : 1
    } finally {
        await memory.close().catch(() => undefined)
    }
}
