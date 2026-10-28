/**
 * A refactor test update's git steps (#686): opening it with the hashes of
 * the worktree's test files, and, after the test-writer's turn, finding the
 * test files it changed since. Reads the worktree only.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import uniq from 'lodash/uniq'

import type { BuildAction } from './build-action'
import { need, ticketWorktree, type BuildContext } from './build-context'

import { testFilesAmong } from '../gates/test-runner'
import { isTestHelper } from '../guards/write-rules'
import type { TestFileHash } from '../journal/refactor-update-entries'

/**
 * Each test file (matching `test_file_patterns` or `test_helper_patterns`)
 * in the worktree, with a hash of its contents, by path.
 */
const testFileHashes = async ({
    context,
    cwd,
}: {
    context: BuildContext
    cwd: string
}): Promise<TestFileHash[]> => {
    const { config } = context
    const files = await context.git.listFiles({ cwd })
    const tests = new Set(
        testFilesAmong({
            files,
            test_file_patterns: config.test_file_patterns,
        })
    )
    const hashes: TestFileHash[] = []
    for (const path of files) {
        if (!tests.has(path) && !isTestHelper({ path, config })) continue
        // A deleted tracked file is still listed; it has no contents.
        const contents = await readFile(join(cwd, path)).catch(() => null)
        if (contents === null) continue
        const hash = new Bun.CryptoHasher('sha256')
            .update(contents)
            .digest('hex')
        hashes.push({ path, hash })
    }
    return hashes
}

export const openRefactorUpdate = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'open_refactor_update' }>
}) => {
    const { ticket, file, reason } = action
    const { path } = ticketWorktree({ state: context.state, ticket })
    context.journal.append({
        kind: 'refactor_test_update',
        ticket,
        role: null,
        content: {
            file,
            reason,
            test_files: await testFileHashes({ context, cwd: path }),
        },
    })
}

/**
 * The test files changed, added, or deleted since the open refactor test
 * update, by their contents' hashes then and now.
 */
export const checkRefactorUpdate = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'check_refactor_update' }>
}) => {
    const { ticket } = action
    const update = need({
        value: context.state.tickets[ticket]?.refactor_update,
        what: `refactor test update for #${ticket}`,
    })
    const { path } = ticketWorktree({ state: context.state, ticket })
    const before = new Map(
        update.test_files.map((entry) => [entry.path, entry.hash])
    )
    const now = new Map(
        (await testFileHashes({ context, cwd: path })).map((entry) => [
            entry.path,
            entry.hash,
        ])
    )
    const paths = uniq([...before.keys(), ...now.keys()]).toSorted()
    context.journal.append({
        kind: 'refactor_test_update_checked',
        ticket,
        role: null,
        content: {
            changed: paths.filter((file) => before.get(file) !== now.get(file)),
        },
    })
}
