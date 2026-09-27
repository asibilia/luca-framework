#!/usr/bin/env bun
/**
 * Runs every check in the repo's `.luca/config.json` (its test commands,
 * then `types`, then `lint`), read from that file, so the PR check and
 * Luca's own gates can't drift apart.
 *
 * Every check runs, even after one fails; the script exits 1 if any failed.
 *
 * Usage: bun scripts/run-checks.ts
 */
import { join } from 'node:path'

import {
    loadEngineConfig,
    testCommands,
} from '../packages/engine/src/config/engine-config'

const REPO_ROOT = join(import.meta.dir, '..')

/** Runs one check in a shell (a check may chain commands with `&&`). */
const runCheck = async ({ command }: { command: string }): Promise<boolean> => {
    console.log(`\n$ ${command}`)
    const child = Bun.spawn(['sh', '-c', command], {
        cwd: REPO_ROOT,
        stdout: 'inherit',
        stderr: 'inherit',
    })
    return (await child.exited) === 0
}

const result = await loadEngineConfig({ repo_root: REPO_ROOT })
if (!result.ok) {
    console.error(result.error)
    process.exit(1)
}

const { types, lint } = result.config.checks
const commands = [
    ...testCommands({ config: result.config }).map(({ run }) => run),
    ...(types === undefined ? [] : [types]),
    ...(lint === undefined ? [] : [lint]),
]
if (commands.length === 0) {
    console.error('.luca/config.json lists no checks')
    process.exit(1)
}

const failed: string[] = []
for (const command of commands) {
    if (!(await runCheck({ command }))) failed.push(command)
}

if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed:`)
    for (const command of failed) console.error(`  ${command}`)
    process.exit(1)
}
console.log(`\nAll ${commands.length} checks passed.`)
