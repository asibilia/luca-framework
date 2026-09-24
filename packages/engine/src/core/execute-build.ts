import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import uniq from 'lodash/uniq'

import { mayEditTests, type BuildAction } from './decide-build'

import type { AgentLauncher, AgentTurn } from '../agents/agent-launcher'
import { parseRoleResult, type AgentRole } from '../agents/role-results'
import type { EngineConfig } from '../config/engine-config'
import { runGates, shellCheck } from '../gates/gate-runner'
import { newCodeFiles, importStem, scanLeftovers } from '../gates/leftover-scan'
import {
    dependenciesChanged,
    installCommand,
    MANIFEST,
    newWorktreeInstall,
    rebaseNeedsInstall,
} from '../gates/lockfile-install'
import { checkRed } from '../gates/red-check'
import { runTests, testFilesAmong } from '../gates/test-runner'
import type { GitAdapter } from '../git/git-adapter'
import { describeViolations } from '../guards/after-turn-check'
import { guardRoleOf } from '../guards/role-rules'
import { enforceAfterTurn, snapshotWorktree } from '../guards/worktree-state'
import type { Journal } from '../journal/journal'
import type { AgentFailure, GateTarget } from '../journal/journal-record'
import {
    replayRun,
    type ReplayedWorktree,
    type RunState,
} from '../journal/replay'
import { sessionSignal } from '../limits/plan-signals'
import type { Tracker } from '../tracker/tracker'

/** What the engine needs, beyond the journal and tracker, to build tickets. */
export type BuildDeps = {
    git: GitAdapter
    launcher: AgentLauncher
}

type BuildContext = BuildDeps & {
    journal: Journal
    tracker: Tracker
    state: RunState
    config: EngineConfig
    /** The run's folder, next to its journal and outside git. */
    run_dir: string
}

/** The run branch's name: one per run, so runs never share a branch. */
export const runBranchName = ({
    spec_number,
    run_id,
}: {
    spec_number: number
    run_id: string
}): string => `luca/spec-${spec_number}-${run_id}`

const need = <T>({
    value,
    what,
}: {
    value: T | null | undefined
    what: string
}): T => {
    if (value === null || value === undefined) {
        throw new Error(`The journal has no ${what} yet.`)
    }
    return value
}

const ticketWorktree = ({
    state,
    ticket,
}: {
    state: RunState
    ticket: number
}): ReplayedWorktree =>
    need({
        value: state.tickets[ticket]?.worktree,
        what: `worktree for #${ticket}`,
    })

/** A fresh report file outside the worktree, so it is never a leftover. */
const reportFile = async ({
    context,
    ticket,
    label,
}: {
    context: BuildContext
    ticket: number
    label: string
}): Promise<string> => {
    const folder = join(context.run_dir, 'reports')
    await mkdir(folder, { recursive: true })
    return join(folder, `${context.state.last_seq + 1}-${ticket}-${label}.xml`)
}

const testFilesIn = async ({
    context,
    cwd,
}: {
    context: BuildContext
    cwd: string
}): Promise<string[]> =>
    testFilesAmong({
        files: await context.git.listFiles({ cwd }),
        test_file_patterns: context.config.test_file_patterns,
    })

const testCommand = ({ config }: { config: EngineConfig }): string =>
    need({
        value: config.checks.test,
        what: 'test command in the engine config',
    })

const readOrNull = async (path: string): Promise<string | null> =>
    existsSync(path) ? Bun.file(path).text() : null

const runRedCheck = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'run_red_check' }>
}) => {
    const { path } = ticketWorktree({
        state: context.state,
        ticket: action.ticket,
    })
    const baseline = need({
        value: context.state.tickets[action.ticket]?.baseline,
        what: `baseline test run for #${action.ticket}`,
    })
    const test_files = await testFilesIn({ context, cwd: path })
    const current = await runTests({
        cwd: path,
        command: testCommand(context),
        test_files,
        report_file: await reportFile({
            context,
            ticket: action.ticket,
            label: 'red',
        }),
    })
    const files = uniq(
        action.mapping.flatMap(({ tests }) => tests.map(({ file }) => file))
    )
    const sources: Record<string, string | null> = {}
    for (const file of files) sources[file] = await readOrNull(join(path, file))
    const result = checkRed({
        criteria_ids: action.criteria_ids,
        mapping: action.mapping,
        baseline,
        current,
        test_files,
        sources,
    })
    context.journal.append({
        kind: 'red_check',
        ticket: action.ticket,
        role: null,
        content: { ...result, tests: current },
    })
}

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

const commitTicket = async ({
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
    const changes = await context.git.changes({ cwd })
    const test_files = testFilesAmong({
        files: changes.map(({ path }) => path),
        test_file_patterns: context.config.test_file_patterns,
    })
    const added = changes.filter(({ change }) => change === 'added')
    const added_texts: Record<string, string> = {}
    for (const { path } of added) {
        added_texts[path] = (await readOrNull(join(cwd, path))) ?? ''
    }
    const used_code: Record<string, boolean> = {}
    for (const path of newCodeFiles({ changes, test_files })) {
        used_code[path] = await isUsed({ context, cwd, path, added_texts })
    }
    const snapshot = need({
        value: context.state.snapshot,
        what: 'spec snapshot',
    })
    const ticket = snapshot.tickets[action.ticket]
    const mention_text = [snapshot.spec.body, ticket?.body ?? ''].join('\n')
    const hits = scanLeftovers({ changes, test_files, mention_text, used_code })
    context.journal.append({
        kind: 'leftover_scan',
        ticket: action.ticket,
        role: null,
        content: { stage: action.stage, hits },
    })
    if (hits.length > 0) return
    if (changes.length === 0 && action.stage === 'fix') {
        // The fixers changed nothing (every finding was a "won't fix"): no
        // commit to make, so the re-review's new changes are empty.
        context.journal.append({
            kind: 'commit_made',
            ticket: action.ticket,
            role: null,
            content: {
                stage: action.stage,
                sha: await context.git.head({ cwd }),
                message: action.message,
                files: [],
            },
        })
        return
    }
    const commit = await context.git.commitAll({ cwd, message: action.message })
    context.journal.append({
        kind: 'commit_made',
        ticket: action.ticket,
        role: null,
        content: {
            stage: action.stage,
            sha: commit.sha,
            message: action.message,
            files: commit.files,
        },
    })
}

const failTurn = ({
    context,
    ticket,
    role,
    error,
    failure,
    session_id,
}: {
    context: BuildContext
    ticket: number
    role: AgentRole
    error: string
    failure: AgentFailure
    session_id: string | null
}) => {
    context.journal.append({
        kind: 'agent_failed',
        ticket,
        role,
        content: { role, error, failure, session_id },
    })
}

/**
 * Runs one agent turn, a launch or a follow-up, and journals how it ended.
 * Before the turn the engine snapshots the worktree; after it, the
 * after-turn check undoes and reports anything the role may not change, for
 * every launcher alike. Then the result is judged by its structured output.
 * Each failed turn is journaled once as `agent_failed` with how it failed;
 * the decision step picks what happens next. A launcher stop journals
 * `run_stopped` and ends the run. A turn the plan cut off (a rejected limit,
 * overage, a billing error) journals only its session.
 */
const runTurn = async ({
    context,
    ticket,
    role,
    may_edit_tests,
    start,
}: {
    context: BuildContext
    ticket: number
    role: AgentRole
    may_edit_tests: boolean
    start: (cwd: string) => Promise<AgentTurn>
}) => {
    const { path, branch } = ticketWorktree({ state: context.state, ticket })
    const before = await snapshotWorktree({
        cwd: path,
        branch,
        config: context.config,
    })
    const turn = await start(path)
    if (turn.session !== undefined) {
        context.journal.append({
            kind: 'agent_session',
            ticket,
            role,
            content: { role, session: turn.session },
        })
    }
    const guard_role = guardRoleOf({ role })
    const { violations } = await enforceAfterTurn({
        cwd: path,
        branch,
        role: guard_role,
        may_edit_tests,
        config: context.config,
        before,
    })
    // The plan cut the turn off. Its session, journaled above, holds why,
    // and the decision step reads it from there: a limit wait or a billing
    // stop. The turn uses up no try, and its step is taken again. With no
    // sign in the session, the engine can't tell which, so it stops.
    const unexplained =
        !turn.ok &&
        turn.failure === 'plan' &&
        (turn.session === undefined ||
            sessionSignal({ session: turn.session }).kind === 'ok')
    if (!turn.ok && turn.failure === 'plan' && !unexplained) return
    if (!turn.ok && (turn.failure === 'stop' || unexplained)) {
        context.journal.append({
            kind: 'run_stopped',
            ticket,
            role,
            content: { reason: turn.error, role, billing: false },
        })
        throw new Error(`Run stopped: ${turn.error}`)
    }
    const session_id = turn.session_id ?? null
    const fail = (failure: AgentFailure, error: string) =>
        failTurn({ context, ticket, role, error, failure, session_id })
    if (violations.length > 0) {
        return fail(
            'guard',
            describeViolations({ role: guard_role, violations })
        )
    }
    if (!turn.ok) {
        return fail(turn.failure === 'engine' ? 'engine' : 'agent', turn.error)
    }
    if (
        turn.structured_output === undefined ||
        turn.structured_output === null
    ) {
        return fail('result', `The ${role} finished with no structured output.`)
    }
    const checked = parseRoleResult({ role, output: turn.structured_output })
    if (!checked.ok) return fail('result', checked.error)
    context.journal.append({
        kind: 'agent_finished',
        ticket,
        role,
        content: { ...checked.value, session_id },
    })
}

const launchAgent = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'launch_agent' }>
}) => {
    const { ticket, role, prompt, may_edit_tests } = action
    context.journal.append({
        kind: 'agent_started',
        ticket,
        role,
        content: { role, prompt, follow_up_of: null },
    })
    await runTurn({
        context,
        ticket,
        role,
        may_edit_tests,
        start: (cwd) =>
            context.launcher.launch({
                role,
                ticket,
                prompt,
                cwd,
                may_edit_tests,
                config: context.config,
            }),
    })
}

const followUpAgent = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'follow_up_agent' }>
}) => {
    const { ticket, role, session_id, message } = action
    const snapshot = need({
        value: context.state.snapshot?.tickets[ticket],
        what: `snapshot of #${ticket}`,
    })
    context.journal.append({
        kind: 'agent_started',
        ticket,
        role,
        content: { role, prompt: message, follow_up_of: session_id },
    })
    await runTurn({
        context,
        ticket,
        role,
        may_edit_tests: mayEditTests({ role, ticket: snapshot }),
        start: (cwd) =>
            context.launcher.followUp({
                session_id,
                role,
                ticket,
                message,
                cwd,
                config: context.config,
            }),
    })
}

/**
 * Puts a joined ticket's change back on top of the run branch: undoes the
 * join first if asked (its gates failed), then resets the ticket's worktree
 * to the run branch's tip and applies the ticket's whole diff there,
 * uncommitted, with conflict markers in the files that clash. Journals the
 * clashed files split into tests and code.
 */
const rebaseTicket = async ({
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
    let undone: string[] = []
    if (action.undo_first_sha !== null) {
        const joined = progress?.joined
        const last = joined?.ok ? joined.shas.at(-1) : undefined
        const undoneFiles =
            last === undefined
                ? []
                : await git.filesBetween({
                      cwd: runBranch.path,
                      from: `${action.undo_first_sha}^`,
                      to: last,
                  })
        undone = (
            await git.undoReplay({
                cwd: runBranch.path,
                first_sha: action.undo_first_sha,
            })
        ).undone
        // The undone join's install is still in the run branch's
        // node_modules: put the lockfile's back.
        if (dependenciesChanged({ changed_files: undoneFiles })) {
            await installIn({
                journal,
                cwd: runBranch.path,
                target: 'run_branch',
                ticket: null,
            })
        }
    }
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
 * The frozen install in a new (or moved) worktree, journaled as
 * `dependencies_installed`. A worktree with no `package.json` has nothing
 * to install (`check` is `null`).
 */
const installIn = async ({
    journal,
    cwd,
    target,
    ticket,
}: {
    journal: Journal
    cwd: string
    target: GateTarget
    ticket: number | null
}) => {
    const command = newWorktreeInstall({
        has_manifest: existsSync(join(cwd, MANIFEST)),
    })
    journal.append({
        kind: 'dependencies_installed',
        ticket,
        role: null,
        content: {
            target,
            check:
                command === null
                    ? null
                    : await shellCheck({ name: 'install', command, cwd }),
        },
    })
}

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
}: BuildDeps & {
    action: BuildAction
    journal: Journal
    tracker: Tracker
}): Promise<void> => {
    const state = replayRun({ records: journal.read() })
    const config = need({ value: state.config, what: 'engine config' })
    const run_dir = dirname(journal.file)
    const context: BuildContext = {
        git,
        launcher,
        journal,
        tracker,
        state,
        config,
        run_dir,
    }
    switch (action.type) {
        case 'create_run_branch': {
            const branch = runBranchName({
                spec_number: action.spec_number,
                run_id: basename(run_dir),
            })
            const path = join(run_dir, 'run-branch')
            const { base_sha } = await git.createRunBranch({
                branch,
                base_branch: action.base_branch,
                path,
            })
            journal.append({
                kind: 'run_branch_created',
                ticket: null,
                role: null,
                content: { branch, path, base_sha },
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
            const run = await runTests({
                cwd: path,
                command: testCommand(context),
                test_files: await testFilesIn({ context, cwd: path }),
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
                content: { sha },
            })
            return
        }
        case 'run_red_check':
            return runRedCheck({ context, action })
        case 'commit_ticket':
            return commitTicket({ context, action })
        case 'run_gates': {
            const { path: cwd, base_sha } =
                action.target === 'ticket'
                    ? ticketWorktree({ state, ticket: action.ticket })
                    : need({ value: state.run_branch, what: 'run branch' })
            const result = await runGates({
                cwd,
                config,
                install: installCommand({
                    changed_files: await git.changedSince({
                        cwd,
                        from: base_sha,
                    }),
                    target: action.target,
                }),
                test_files: await testFilesIn({ context, cwd }),
                report_file: await reportFile({
                    context,
                    ticket: action.ticket,
                    label: `gates-${action.target}`,
                }),
            })
            journal.append({
                kind: 'gates_run',
                ticket: action.ticket,
                role: null,
                content: { target: action.target, ...result },
            })
            return
        }
        case 'join_run_branch': {
            const worktree = ticketWorktree({ state, ticket: action.ticket })
            const runBranch = need({
                value: state.run_branch,
                what: 'run branch',
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
        case 'mark_stuck':
            journal.append({
                kind: 'ticket_stuck',
                ticket: action.ticket,
                role: null,
                content: { reason: action.reason, detail: action.detail },
            })
            return
        case 'open_pull_request': {
            const { head, base, title, body } = action
            const opened = await tracker.openPullRequest({
                head,
                base,
                title,
                body,
            })
            journal.append({
                kind: 'pull_request_opened',
                ticket: null,
                role: null,
                content: { ...opened, head, base, title, body },
            })
            return
        }
        case 'done':
        case 'invalid_journal':
            return
    }
}
