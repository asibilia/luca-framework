/**
 * The engine's commits: the leftover scan, then a commit of a worktree's
 * changes (`commitIn`), with agents' changesets dropped first and a crashed
 * try's commit adopted. Serves the `commit_ticket` step and the final review.
 */
import { rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { need, ticketWorktree, type BuildContext } from './build-context'
import type { BuildAction } from './decide-build'
import { leaveOutIn, ticketChanges } from './worktree-changes'

import {
    importStem,
    isAgentChangeset,
    leftoverPasses,
    nameCheckedFiles,
    newCodeFiles,
    scanLeftovers,
} from '../gates/leftover-scan'
import { testFilesAmong } from '../gates/test-runner'
import type { FileChange } from '../git/git-adapter'
import { pathText } from '../git/path-text'
import { isTestHelper } from '../guards/role-rules'
import type { CommitStage } from '../journal/journal-record'

/** Whether anything besides the file itself mentions a new code file. */
const isUsed = async ({
    context,
    cwd,
    path,
    added_texts,
}: {
    context: BuildContext
    cwd: string
    path: string
    added_texts: Record<string, string>
}): Promise<boolean> => {
    const stem = importStem(path)
    const tracked = await context.git.filesMentioning({ cwd, text: stem })
    if (tracked.some((file) => file !== path)) return true
    return Object.entries(added_texts).some(
        ([file, text]) => file !== path && text.includes(stem)
    )
}

/**
 * Whether a file other than itself and the tests names this scratch-named
 * file or new markdown (#520) by its basename, as a TOC, `package.json`, a
 * doc index, or a config does: a
 * tracked file, or one this change adds (a new addon's TOC names its new
 * modules). A mention in a test doesn't make a file the repo's.
 */
const isNamed = async ({
    context,
    cwd,
    path,
    added_texts,
}: {
    context: BuildContext
    cwd: string
    path: string
    added_texts: Record<string, string>
}): Promise<boolean> => {
    const name = basename(path)
    const tracked = await context.git.filesMentioning({ cwd, text: name })
    const added = Object.entries(added_texts)
        .filter(([, text]) => text.includes(name))
        .map(([file]) => file)
    const files = [...tracked, ...added].filter((file) => file !== path)
    const tests = testFilesAmong({
        files,
        test_file_patterns: context.config.test_file_patterns,
    })
    return files.some((file) => !tests.includes(file))
}

/**
 * In a repo with changesets, removes the changesets an agent wrote (see
 * `isAgentChangeset`) from the worktree and journals `changeset_dropped`:
 * the engine writes the run's one itself. Returns the other changes.
 */
export const dropAgentChangesets = async ({
    context,
    cwd,
    ticket,
    changes,
}: {
    context: BuildContext
    cwd: string
    ticket: number | null
    changes: FileChange[]
}): Promise<FileChange[]> => {
    if (!context.state.changesets) return changes
    const paths = changes.filter(isAgentChangeset).map(({ path }) => path)
    if (paths.length === 0) return changes
    for (const path of paths) await rm(join(cwd, path), { force: true })
    context.journal.append({
        kind: 'changeset_dropped',
        ticket,
        role: null,
        content: { paths },
    })
    return changes.filter(({ path }) => !paths.includes(path))
}

/**
 * The commit a crash left behind at `cwd`: HEAD carries `message` and no
 * record names it yet, so the step's first try made it and died before
 * journaling it. `null` when HEAD is no such commit.
 */
const leftCommit = async ({
    context,
    cwd,
    message,
}: {
    context: BuildContext
    cwd: string
    message: string
}): Promise<{ sha: string; message: string; files: string[] } | null> => {
    const last = await context.git.lastCommit({ cwd })
    if (last.message !== message.trim()) return null
    const journaled = context.journal
        .read()
        .some(
            (record) =>
                (record.kind === 'commit_made' &&
                    record.content.sha === last.sha) ||
                (record.kind === 'ticket_joined' &&
                    record.content.ok &&
                    record.content.shas.includes(last.sha))
        )
    return journaled ? null : { sha: last.sha, message, files: last.files }
}

/**
 * The leftover scan, then an engine commit of everything in `cwd`, both
 * journaled. What the prepare command made (`prepare_made`) and untracked
 * links pointing outside the checkout (see `leaveOutIn`) are neither
 * scanned nor committed. An agent's changeset is dropped before the scan
 * (see `dropAgentChangesets`). A hit blocks the commit. A redo after a crash that
 * already committed (nothing left to commit, and HEAD is an unjournaled
 * commit with this message) journals that commit instead of making
 * another; its scan, of a clean worktree, finds nothing, as the first try's
 * did before it committed.
 *
 * Nothing to commit never runs `git commit`, which would fail (#494): the
 * current commit is journaled with no files instead. That is a `fix` round
 * whose every finding was a "won't fix", a green stage whose change a
 * rebase found already on the run branch, or one whose every change came
 * from prepare. (A red stage with nothing to commit fails its red check
 * first, so it gets here only if the worktree changed after that check.)
 */
export const commitIn = async ({
    context,
    cwd,
    ticket,
    stage,
    message,
    mention_text,
}: {
    context: BuildContext
    cwd: string
    /** `null` for the final review. */
    ticket: number | null
    stage: CommitStage
    message: string
    /** The spec and ticket text a new markdown file may be named in. */
    mention_text: string
}) => {
    const leave_out = await leaveOutIn({ context, cwd, ticket })
    const changes = await dropAgentChangesets({
        context,
        cwd,
        ticket,
        changes: await ticketChanges({ context, cwd, leave_out }),
    })
    const test_files = testFilesAmong({
        files: changes.map(({ path }) => path),
        test_file_patterns: context.config.test_file_patterns,
    })
    const added = changes.filter(({ change }) => change === 'added')
    const added_texts: Record<string, string> = {}
    for (const { path } of added) {
        added_texts[path] = (await pathText({ path: join(cwd, path) })) ?? ''
    }
    const used_code: Record<string, boolean> = {}
    for (const path of newCodeFiles({ changes, test_files })) {
        used_code[path] = await isUsed({ context, cwd, path, added_texts })
    }
    const named: string[] = []
    for (const path of nameCheckedFiles({ changes })) {
        // A test helper (#619) is the tests', so a test that uses it names it.
        const helper = isTestHelper({ path, config: context.config })
        if (
            helper
                ? await isUsed({ context, cwd, path, added_texts })
                : await isNamed({ context, cwd, path, added_texts })
        ) {
            named.push(path)
        }
    }
    const inputs = {
        changes,
        test_files,
        mention_text,
        used_code,
        named,
        leftover_allow: context.config.leftover_allow ?? [],
    }
    const hits = scanLeftovers(inputs)
    const passed = leftoverPasses(inputs)
    context.journal.append({
        kind: 'leftover_scan',
        ticket,
        role: null,
        content: { stage, hits, ...(passed.length > 0 ? { passed } : {}) },
    })
    if (hits.length > 0) return
    const adopted =
        changes.length === 0 && context.step.redo
            ? await leftCommit({ context, cwd, message })
            : null
    if (adopted !== null) {
        context.journal.append({
            kind: 'commit_made',
            ticket,
            role: null,
            content: { stage, ...adopted },
        })
        return
    }
    if (changes.length === 0) {
        // Nothing to commit: `git commit` would fail. For a fix round, the
        // re-review's new changes are then empty.
        context.journal.append({
            kind: 'commit_made',
            ticket,
            role: null,
            content: {
                stage,
                sha: await context.git.head({ cwd }),
                message,
                files: [],
            },
        })
        return
    }
    const commit = await context.git.commitAll({ cwd, message, leave_out })
    context.journal.append({
        kind: 'commit_made',
        ticket,
        role: null,
        content: { stage, sha: commit.sha, message, files: commit.files },
    })
}

export const commitTicket = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'commit_ticket' }>
}) => {
    const { path: cwd } = ticketWorktree({
        state: context.state,
        ticket: action.ticket,
    })
    const snapshot = need({
        value: context.state.snapshot,
        what: 'spec snapshot',
    })
    const ticket = snapshot.tickets[action.ticket]
    await commitIn({
        context,
        cwd,
        ticket: action.ticket,
        stage: action.stage,
        message: action.message,
        mention_text: [snapshot.spec.body, ticket?.body ?? ''].join('\n'),
    })
}
