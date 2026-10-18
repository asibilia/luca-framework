/**
 * The run branch's joins, undone and redone: a join a crash cut off
 * (`openJoin`), undoing a ticket's join, rebasing a ticket onto the run
 * branch, and sending its tests back to the test-writer after a rebase.
 */
import uniq from 'lodash/uniq'

import { need, ticketWorktree, type BuildContext } from './build-context'
import type { BuildAction } from './decide-build'
import { installIn } from './execute-gates'
import { closeSessions, openSessionsIn } from './session-close'

import {
    dependenciesChanged,
    rebaseNeedsInstall,
} from '../gates/lockfile-install'
import { testFilesAmong } from '../gates/test-runner'
import type { JournalRecord } from '../journal/journal-record'
import type { RunState } from '../journal/replay'

/**
 * Where the run branch stood before a join of `ticket` a crash cut off: the
 * latest `join_started` for it with no `ticket_joined` or `ticket_stuck`
 * for it after, else `null`.
 *
 * @example
 * openJoin({ records: journal.read(), ticket: 11 }) // 'a1b2c3...' after a crash mid-join
 */
export const openJoin = ({
    records,
    ticket,
}: {
    records: JournalRecord[]
    ticket: number
}): string | null => {
    const last = records.findLast(
        (record) =>
            record.ticket === ticket &&
            (record.kind === 'join_started' ||
                record.kind === 'ticket_joined' ||
                record.kind === 'ticket_stuck')
    )
    return last?.kind === 'join_started' ? last.content.run_branch_sha : null
}

/**
 * Puts the run branch back where it stood before a join of `ticket` a crash
 * cut off, dropping whatever half of its commits the crash left there. A
 * cut-off step is taken again before other steps start, so nothing else
 * moved the run branch since. Does nothing when no join was cut off.
 */
export const undoCutOffJoin = async ({
    context,
    ticket,
}: {
    context: BuildContext
    ticket: number
}) => {
    const sha = openJoin({ records: context.journal.read(), ticket })
    if (sha === null) return
    const runBranch = need({
        value: context.state.run_branch,
        what: 'run branch',
    })
    await context.git.resetWorktree({ cwd: runBranch.path, to: sha })
}

/**
 * The run branch commits an undo of `ticket`'s join may take (#519): its
 * own joined commits, and those of any other ticket that joined and has not
 * pushed (a later join on top goes with it, and replay clears that join
 * too). A pushed ticket's commits never.
 */
const undoableCommits = ({
    state,
    ticket,
}: {
    state: RunState
    ticket: number
}): string[] =>
    uniq(
        Object.entries(state.tickets).flatMap(([number, progress]) => {
            const { joined } = progress
            if (!joined?.ok) return []
            const own = Number(number) === ticket
            return own || progress.pushed === null ? joined.shas : []
        })
    )

/**
 * Undoes a ticket's join on the run branch, back to before `first_sha`, and
 * returns the commits undone. It never rewinds over other work (#519): it
 * may only undo the ticket's own join and later joins not pushed yet
 * (`undoableCommits`). When git refuses, the run branch is left alone, the
 * ticket is stuck (`undo_refused`) with why, and it returns `null`, so the
 * caller does nothing more. The undone joins' install is still in the run
 * branch's `node_modules`, so when their commits changed dependency files
 * the lockfile's install runs there again.
 */
export const undoJoin = async ({
    context,
    ticket,
    first_sha,
}: {
    context: BuildContext
    ticket: number
    first_sha: string
}): Promise<string[] | null> => {
    const { git, state, journal, launcher } = context
    const runBranch = need({ value: state.run_branch, what: 'run branch' })
    const joined = state.tickets[ticket]?.joined
    const tip = await git.head({ cwd: runBranch.path })
    const undo = await git.undoReplay({
        cwd: runBranch.path,
        first_sha,
        only: undoableCommits({ state, ticket }),
    })
    if (!undo.ok) {
        // A stuck ticket's agents take no more follow-ups.
        await closeSessions({
            journal,
            launcher,
            sessions: openSessionsIn({ records: journal.read() }).filter(
                (session) => session.ticket === ticket
            ),
        })
        journal.append({
            kind: 'ticket_stuck',
            ticket,
            role: null,
            content: {
                reason: 'undo_refused',
                detail: `The engine went to undo this ticket's join on the run branch (from ${first_sha.slice(0, 7)}), but that would have rewound the run branch over other work, so the run branch was left alone:\n${undo.error}`,
            },
        })
        return null
    }
    const { undone } = undo
    const undoneFiles =
        undone.length === 0
            ? []
            : await git.filesBetween({
                  cwd: runBranch.path,
                  from: `${first_sha}^`,
                  to: tip,
              })
    // A redo whose first try undid the join before a crash finds nothing
    // left to undo: the commits it undid are the journaled join's.
    const named =
        undone.length === 0 && context.step.redo && joined?.ok === true
            ? joined.shas
            : undone
    if (dependenciesChanged({ changed_files: undoneFiles })) {
        await installIn({
            journal,
            cwd: runBranch.path,
            target: 'run_branch',
            ticket: null,
        })
    }
    return named
}

/**
 * Puts a joined ticket's change back on top of the run branch: undoes the
 * join first if asked (its gates failed), then resets the ticket's worktree
 * to the run branch's tip and applies the ticket's whole diff there,
 * uncommitted, with conflict markers in the files that clash. Journals the
 * clashed files split into tests and code. A refused undo (#519) leaves the
 * ticket stuck, and nothing is rebased.
 */
export const rebaseTicket = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'rebase_ticket' }>
}) => {
    const { git, state, journal, config } = context
    const worktree = ticketWorktree({ state, ticket: action.ticket })
    const runBranch = need({ value: state.run_branch, what: 'run branch' })
    const progress = state.tickets[action.ticket]
    // The ticket's latest commit: a review fix round's, or the green one.
    const head = need({
        value: progress?.commits.fix ?? progress?.commits.green,
        what: `green commit for #${action.ticket}`,
    })
    const undone =
        action.undo_first_sha === null
            ? []
            : await undoJoin({
                  context,
                  ticket: action.ticket,
                  first_sha: action.undo_first_sha,
              })
    // A refused undo left the run branch alone and the ticket stuck.
    if (undone === null) return
    const onto = await git.head({ cwd: runBranch.path })
    const moved_files = await git.filesBetween({
        cwd: worktree.path,
        from: worktree.base_sha,
        to: onto,
    })
    const ticket_files = await git.filesBetween({
        cwd: worktree.path,
        from: worktree.base_sha,
        to: head,
    })
    const { conflicts } = await git.rebaseWorktree({
        cwd: worktree.path,
        from: worktree.base_sha,
        to: head,
        onto,
    })
    const tests = testFilesAmong({
        files: conflicts,
        test_file_patterns: config.test_file_patterns,
    })
    journal.append({
        kind: 'ticket_rebased',
        ticket: action.ticket,
        role: null,
        content: {
            cause: action.cause,
            base_sha: onto,
            tests,
            code: conflicts.filter((file) => !tests.includes(file)),
            undone,
            reinstall: rebaseNeedsInstall({ moved_files, ticket_files }),
        },
    })
}

/**
 * Sends a ticket's tests back to its test-writer after a rebase (#489):
 * looks up the tickets whose joined commits the run branch got between the
 * ticket's old base and its new one, and the files the run branch changed
 * there, then journals it all as `tests_sent_back`. Reads git only.
 */
export const sendTestsBack = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'send_tests_back' }>
}) => {
    const { git, state, journal } = context
    const { ticket, round, bad_test, from_sha, base_sha } = action
    const worktree = ticketWorktree({ state, ticket })
    const commits = await git.commitsBetween({
        cwd: worktree.path,
        from: from_sha,
        to: base_sha,
    })
    const files = await git.filesBetween({
        cwd: worktree.path,
        from: from_sha,
        to: base_sha,
    })
    const joined = Object.entries(state.tickets).flatMap(
        ([number, progress]) => {
            const other = Number(number)
            const shas = progress.joined?.ok ? progress.joined.shas : []
            if (other === ticket || !shas.some((sha) => commits.includes(sha)))
                return []
            const title = state.snapshot?.tickets[other]?.title ?? ''
            return [{ ticket: other, title }]
        }
    )
    journal.append({
        kind: 'tests_sent_back',
        ticket,
        role: null,
        content: { round, bad_test, from_sha, base_sha, joined, files },
    })
}
