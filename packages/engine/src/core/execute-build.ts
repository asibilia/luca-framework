import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'

import { followUpAgent, launchAgent } from './agent-turn'
import type { AlreadyDoneAction } from './already-done'
import {
    buildContext,
    need,
    reportFile,
    testFilesIn,
    ticketWorktree,
    type BuildDeps,
} from './build-context'
import { CHANGESET_CONFIG } from './changeset'
import { commitTicket } from './commit-in'
import type { BuildAction } from './decide-build'
import type { FinalReviewAction } from './decide-final-review'
import { checkAlreadyDoneIn } from './execute-already-done-check'
import { gatesIn, installIn } from './execute-gates'
import {
    rebaseTicket,
    sendTestsBack,
    undoCutOffJoin,
    undoJoin,
} from './execute-join'
import { runRedCheck } from './execute-red-check'
import { retryTicket } from './execute-stuck'
import { closeSessions, openSessionsIn } from './session-close'
import { watchPrepare } from './worktree-changes'

import { bunTestCommands, testTimeoutOf } from '../config/engine-config'
import { prepareCheck } from '../gates/gate-runner'
import { runBunTests } from '../gates/test-runner'
import type { Journal } from '../journal/journal'
import type { CommentStep } from '../tracker/post-comment-once'
import type { Tracker } from '../tracker/tracker'

export { runTurn } from './agent-turn'
export {
    buildContext,
    need,
    ticketWorktree,
    type BuildContext,
    type BuildDeps,
} from './build-context'
export { commitIn, dropAgentChangesets } from './commit-in'
export { gatesIn, slowTestsIn } from './execute-gates'
export { openJoin } from './execute-join'
export { NO_RED_CHANGES } from './execute-red-check'
export { leaveOutIn } from './worktree-changes'

/** The run branch's name: one per run, so runs never share a branch. */
export const runBranchName = ({
    spec_number,
    run_id,
}: {
    spec_number: number
    run_id: string
}): string => `luca/spec-${spec_number}-${run_id}`

/**
 * Carries out one build step: git, gates, agents, or the tracker, then
 * records what happened in the journal. `decide` picks the step.
 */
export const executeBuildAction = async ({
    action,
    journal,
    tracker,
    git,
    launcher,
    step,
}: BuildDeps & {
    /**
     * The final review's steps go to `executeFinalReviewAction`, the
     * changeset to `writeChangeset`, the PR to `openPullRequest`, and an
     * already-done ticket's to `executeAlreadyDoneAction`.
     */
    action: Exclude<
        BuildAction,
        | FinalReviewAction
        | AlreadyDoneAction
        | { type: 'write_changeset' }
        | { type: 'open_pull_request' }
    >
    journal: Journal
    tracker: Tracker
    /** Which try of its step this is. Left out, a first try. */
    step?: CommentStep
}): Promise<void> => {
    const context = buildContext({ journal, tracker, git, launcher, step })
    const { state, run_dir } = context
    switch (action.type) {
        case 'create_run_branch': {
            const branch = runBranchName({
                spec_number: action.spec_number,
                run_id: basename(run_dir),
            })
            const path = join(run_dir, 'run-branch')
            // A new run starts from origin's latest; no fetch, no run. Like
            // a launcher stop, it ends the run with a plain message.
            const fetched = await git.fetchBase({
                base_branch: action.base_branch,
            })
            if (!fetched.ok) {
                const reason = `Could not fetch ${action.base_branch} from origin, so the run has no base to start from. Check the network and the repo's origin, then resume the run.\n${fetched.error}`
                journal.append({
                    kind: 'run_stopped',
                    ticket: null,
                    role: null,
                    content: { reason, role: null, billing: false },
                })
                throw new Error(`Run stopped: ${reason}`)
            }
            const { base_sha } = await git.createRunBranch({
                branch,
                base_branch: action.base_branch,
                path,
            })
            journal.append({
                kind: 'run_branch_created',
                ticket: null,
                role: null,
                content: {
                    branch,
                    path,
                    base_sha,
                    changesets: existsSync(join(path, CHANGESET_CONFIG)),
                },
            })
            return
        }
        case 'create_ticket_worktree': {
            const branch = `${action.run_branch}--ticket-${action.ticket}`
            const path = join(run_dir, 'tickets', String(action.ticket))
            const { base_sha } = await git.createWorktree({
                branch,
                from: action.run_branch,
                path,
            })
            journal.append({
                kind: 'ticket_worktree_created',
                ticket: action.ticket,
                role: null,
                content: { branch, path, base_sha },
            })
            return
        }
        case 'install_dependencies': {
            const { path: cwd } =
                action.ticket === null
                    ? need({ value: state.run_branch, what: 'run branch' })
                    : ticketWorktree({ state, ticket: action.ticket })
            return installIn({
                journal,
                cwd,
                target: action.target,
                ticket: action.ticket,
            })
        }
        case 'run_baseline_tests': {
            const { path } = ticketWorktree({ state, ticket: action.ticket })
            const prepare = await watchPrepare({
                context,
                cwd: path,
                ticket: action.ticket,
                run: () => prepareCheck({ config: context.config, cwd: path }),
            })
            if (prepare !== null) {
                journal.append({
                    kind: 'baseline_prepared',
                    ticket: action.ticket,
                    role: null,
                    content: { check: prepare },
                })
                // No agent has worked yet, so a failed prepare leaves the
                // tests unrun and the ticket stuck on its output.
                if (!prepare.ok) return
            }
            const run = await runBunTests({
                cwd: path,
                commands: bunTestCommands(context),
                test_files: await testFilesIn({ context, cwd: path }),
                timeout_ms: testTimeoutOf({ config: context.config }),
                test_concurrency: context.config.test_concurrency,
                report_file: await reportFile({
                    context,
                    ticket: action.ticket,
                    label: 'baseline',
                }),
            })
            journal.append({
                kind: 'baseline_tests',
                ticket: action.ticket,
                role: null,
                content: run,
            })
            return
        }
        case 'reuse_baseline_tests':
            journal.append({
                kind: 'baseline_reused',
                ticket: action.ticket,
                role: null,
                content: {
                    from_ticket: action.from_ticket,
                    base_sha: action.base_sha,
                },
            })
            return
        case 'launch_agent':
            return launchAgent({ context, action })
        case 'follow_up_agent':
            return followUpAgent({ context, action })
        case 'reset_ticket_worktree': {
            const { path } = ticketWorktree({ state, ticket: action.ticket })
            const { sha } = await git.discardChanges({ cwd: path })
            journal.append({
                kind: 'worktree_reset',
                ticket: action.ticket,
                role: null,
                content: {
                    sha,
                    ...(action.bad_test === undefined
                        ? {}
                        : { bad_test: action.bad_test }),
                },
            })
            return
        }
        case 'send_tests_back':
            return sendTestsBack({ context, action })
        case 'run_red_check':
            return runRedCheck({ context, action })
        case 'check_already_done':
            return checkAlreadyDoneIn({ context, action })
        case 'commit_ticket':
            return commitTicket({ context, action })
        case 'run_gates':
            return gatesIn({
                context,
                worktree:
                    action.target === 'ticket'
                        ? ticketWorktree({ state, ticket: action.ticket })
                        : need({ value: state.run_branch, what: 'run branch' }),
                target: action.target,
                ticket: action.ticket,
            })
        case 'join_run_branch': {
            const worktree = ticketWorktree({ state, ticket: action.ticket })
            const runBranch = need({
                value: state.run_branch,
                what: 'run branch',
            })
            await undoCutOffJoin({ context, ticket: action.ticket })
            journal.append({
                kind: 'join_started',
                ticket: action.ticket,
                role: null,
                content: {
                    run_branch_sha: await git.head({ cwd: runBranch.path }),
                },
            })
            const commits = await git.commitsBetween({
                cwd: worktree.path,
                from: worktree.base_sha,
                to: 'HEAD',
            })
            const joined = await git.replay({ cwd: runBranch.path, commits })
            journal.append({
                kind: 'ticket_joined',
                ticket: action.ticket,
                role: null,
                content: joined,
            })
            return
        }
        case 'rebase_ticket':
            return rebaseTicket({ context, action })
        case 'remove_worktrees': {
            for (const path of action.paths) {
                await git.removeWorktree({ path })
            }
            journal.append({
                kind: 'worktrees_removed',
                ticket: null,
                role: null,
                content: { paths: action.paths },
            })
            return
        }
        case 'push_run_branch': {
            const { path } = need({
                value: state.run_branch,
                what: 'run branch',
            })
            await git.push({ cwd: path, branch: action.branch })
            journal.append({
                kind: 'run_branch_pushed',
                ticket: action.ticket,
                role: null,
                content: {
                    branch: action.branch,
                    sha: await git.head({ cwd: path }),
                },
            })
            return
        }
        case 'undo_join': {
            const shas = await undoJoin({
                context,
                ticket: action.ticket,
                first_sha: action.first_sha,
            })
            // A refused undo left the run branch alone and the ticket stuck.
            if (shas === null) return
            journal.append({
                kind: 'join_undone',
                ticket: action.ticket,
                role: null,
                content: { shas },
            })
            return
        }
        case 'retry_ticket':
            return retryTicket({ context, action })
        case 'report_stuck':
        case 'wait_for_reply':
        case 'take_reply':
        case 'ignore_reply':
        case 'skip_ticket':
        case 'report_final_review_stuck':
        case 'ship_final_review':
        case 'retry_final_review':
            // Stuck work's steps; `executeAction` carries them out.
            throw new Error(`${action.type} is not a git or agent step.`)
        case 'mark_stuck':
            // A join crashes cut off too often leaves no half of it behind.
            await undoCutOffJoin({ context, ticket: action.ticket })
            // A stuck ticket's agents take no more follow-ups.
            await closeSessions({
                journal,
                launcher,
                sessions: openSessionsIn({ records: journal.read() }).filter(
                    ({ ticket }) => ticket === action.ticket
                ),
            })
            journal.append({
                kind: 'ticket_stuck',
                ticket: action.ticket,
                role: null,
                content: { reason: action.reason, detail: action.detail },
            })
            return
        case 'done':
        case 'invalid_journal':
            return
    }
}
