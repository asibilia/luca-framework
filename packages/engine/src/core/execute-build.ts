import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import uniq from 'lodash/uniq'

import { mayEditTests, type BuildAction } from './decide-build'
import type { FinalReviewAction } from './decide-final-review'
import { retryTicket } from './execute-stuck'
import { closeSessions, openSessionsIn } from './session-close'

import type { AgentLauncher, AgentTurn } from '../agents/agent-launcher'
import {
    parseRoleResult,
    type AgentRole,
    type RoleResult,
} from '../agents/role-results'
import { bunTestCommands, type EngineConfig } from '../config/engine-config'
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
import { runBunTests, testFilesAmong } from '../gates/test-runner'
import type { GitAdapter } from '../git/git-adapter'
import { describeViolations } from '../guards/after-turn-check'
import { guardRoleOf } from '../guards/role-rules'
import { enforceAfterTurn, snapshotWorktree } from '../guards/worktree-state'
import type { Journal } from '../journal/journal'
import type {
    AgentFailure,
    CommitStage,
    GateTarget,
    JournalRecord,
} from '../journal/journal-record'
import {
    replayRun,
    type ReplayedWorktree,
    type RunState,
} from '../journal/replay'
import { sessionSignal } from '../limits/plan-signals'
import { createAgentMessaging } from '../messages/agent-messaging'
import type { CommentStep } from '../tracker/post-comment-once'
import type { Tracker } from '../tracker/tracker'

/** What the engine needs, beyond the journal and tracker, to build tickets. */
export type BuildDeps = {
    git: GitAdapter
    launcher: AgentLauncher
}

/** What a build step's executor works with. */
export type BuildContext = BuildDeps & {
    journal: Journal
    tracker: Tracker
    state: RunState
    config: EngineConfig
    /** The run's folder, next to its journal and outside git. */
    run_dir: string
    /**
     * Which try of its step this is: a redo after a crash adopts what its
     * first try left behind.
     */
    step: CommentStep
}

/** The run branch's name: one per run, so runs never share a branch. */
export const runBranchName = ({
    spec_number,
    run_id,
}: {
    spec_number: number
    run_id: string
}): string => `luca/spec-${spec_number}-${run_id}`

/** A journaled value, or a clear error that the journal has none yet. */
export const need = <T>({
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

export const ticketWorktree = ({
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
    /** `null` for the final review. */
    ticket: number | null
    label: string
}): Promise<string> => {
    const folder = join(context.run_dir, 'reports')
    await mkdir(folder, { recursive: true })
    return join(
        folder,
        `${context.state.last_seq + 1}-${ticket ?? 'final'}-${label}.xml`
    )
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
    const current = await runBunTests({
        cwd: path,
        commands: bunTestCommands(context),
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
 * journaled. A hit blocks the commit. A `fix` commit with nothing to commit
 * (every finding was a "won't fix") journals the current commit with no
 * files instead. A redo after a crash that already committed (nothing left
 * to commit, and HEAD is an unjournaled commit with this message) journals
 * that commit instead of making another; its scan, of a clean worktree,
 * finds nothing, as the first try's did before it committed.
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
    const hits = scanLeftovers({ changes, test_files, mention_text, used_code })
    context.journal.append({
        kind: 'leftover_scan',
        ticket,
        role: null,
        content: { stage, hits },
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
    if (changes.length === 0 && stage === 'fix') {
        // The fixers changed nothing (every finding was a "won't fix"): no
        // commit to make, so the re-review's new changes are empty.
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
    const commit = await context.git.commitAll({ cwd, message })
    context.journal.append({
        kind: 'commit_made',
        ticket,
        role: null,
        content: { stage, sha: commit.sha, message, files: commit.files },
    })
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

const failTurn = ({
    context,
    ticket,
    role,
    error,
    failure,
    session_id,
}: {
    context: BuildContext
    ticket: number | null
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
 * every launcher alike; what others changed in the shared `.git` meanwhile
 * is journaled as `shared_git_changed`. Then the result is judged by its
 * structured output. Each failed turn is journaled once as `agent_failed`
 * with how it failed; the decision step picks what happens next. A launcher stop journals
 * `run_stopped` and ends the run. A turn the plan cut off (a rejected limit,
 * overage, a billing error) journals only its session. Both close the
 * turn's session first, since no follow-up can reach it.
 *
 * @param worktree - Where the agent works: its ticket's worktree, or the run
 *   branch's for the final review.
 * @param ticket - The ticket its records name, `null` for the final review.
 * @returns The role's result when the agent finished, else `null`.
 */
export const runTurn = async ({
    context,
    worktree,
    ticket,
    role,
    may_edit_tests,
    start,
}: {
    context: BuildContext
    worktree: ReplayedWorktree
    ticket: number | null
    role: AgentRole
    may_edit_tests: boolean
    start: (cwd: string) => Promise<AgentTurn>
}): Promise<RoleResult | null> => {
    const { path, branch } = worktree
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
    const { violations, outside } = await enforceAfterTurn({
        cwd: path,
        branch,
        role: guard_role,
        may_edit_tests,
        config: context.config,
        before,
    })
    // Others' changes to the shared .git: noted, never blamed or undone.
    if (outside.length > 0) {
        context.journal.append({
            kind: 'shared_git_changed',
            ticket,
            role,
            content: { role, changes: outside },
        })
    }
    // The plan cut the turn off. Its session, journaled above, holds why,
    // and the decision step reads it from there: a limit wait or a billing
    // stop. The turn uses up no try, and its step is taken again. With no
    // sign in the session, the engine can't tell which, so it stops.
    const unexplained =
        !turn.ok &&
        turn.failure === 'plan' &&
        (turn.session === undefined ||
            sessionSignal({ session: turn.session }).kind === 'ok')
    // Either way no follow-up reaches the session: close it now.
    const cut = !turn.ok && (turn.failure === 'plan' || turn.failure === 'stop')
    if (cut && turn.session_id !== undefined) {
        await closeSessions({
            journal: context.journal,
            launcher: context.launcher,
            sessions: [{ session_id: turn.session_id, ticket, role }],
        })
    }
    if (!turn.ok && turn.failure === 'plan' && !unexplained) return null
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
    const fail = (failure: AgentFailure, error: string) => {
        failTurn({ context, ticket, role, error, failure, session_id })
        return null
    }
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
    return checked.value
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
        worktree: ticketWorktree({ state: context.state, ticket }),
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
                messaging: createAgentMessaging({
                    journal: context.journal,
                    ticket,
                    role,
                }),
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
        worktree: ticketWorktree({ state: context.state, ticket }),
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
const undoCutOffJoin = async ({
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
 * Undoes a ticket's join on the run branch, back to before `first_sha`, and
 * returns the commits undone. The undone join's install is still in the run
 * branch's `node_modules`, so when its commits changed dependency files the
 * lockfile's install runs there again.
 */
const undoJoin = async ({
    context,
    ticket,
    first_sha,
}: {
    context: BuildContext
    ticket: number
    first_sha: string
}): Promise<string[]> => {
    const { git, state, journal } = context
    const runBranch = need({ value: state.run_branch, what: 'run branch' })
    const joined = state.tickets[ticket]?.joined
    const last = joined?.ok ? joined.shas.at(-1) : undefined
    const undoneFiles =
        last === undefined
            ? []
            : await git.filesBetween({
                  cwd: runBranch.path,
                  from: `${first_sha}^`,
                  to: last,
              })
    const { undone } = await git.undoReplay({ cwd: runBranch.path, first_sha })
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
    const undone =
        action.undo_first_sha === null
            ? []
            : await undoJoin({
                  context,
                  ticket: action.ticket,
                  first_sha: action.undo_first_sha,
              })
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
 * The config's gates in a worktree (with the install first when a manifest
 * changed since its base), journaled as `gates_run`.
 */
export const gatesIn = async ({
    context,
    worktree,
    target,
    ticket,
}: {
    context: BuildContext
    worktree: ReplayedWorktree
    target: GateTarget
    /** `null` for the final review. */
    ticket: number | null
}) => {
    const { path: cwd, base_sha } = worktree
    const result = await runGates({
        cwd,
        config: context.config,
        install: installCommand({
            changed_files: await context.git.changedSince({
                cwd,
                from: base_sha,
            }),
            target,
        }),
        test_files: await testFilesIn({ context, cwd }),
        report_file: await reportFile({
            context,
            ticket,
            label: `gates-${target}`,
        }),
    })
    context.journal.append({
        kind: 'gates_run',
        ticket,
        role: null,
        content: { target, ...result },
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
 * What a build step's executor works with, from the journal as it is now.
 *
 * @example
 * const context = buildContext({ journal, tracker, git, launcher })
 */
export const buildContext = ({
    journal,
    tracker,
    git,
    launcher,
    step,
}: BuildDeps & {
    journal: Journal
    tracker: Tracker
    /** Left out, a first try, numbered after the journal's last record. */
    step?: CommentStep
}): BuildContext => {
    const records = journal.read()
    const state = replayRun({ records })
    const run_dir = dirname(journal.file)
    return {
        git,
        launcher,
        journal,
        tracker,
        state,
        config: need({ value: state.config, what: 'engine config' }),
        run_dir,
        step: step ?? {
            run_id: basename(run_dir),
            first_seq: (records.at(-1)?.seq ?? 0) + 1,
            redo: false,
        },
    }
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
    step,
}: BuildDeps & {
    /** The final review's steps go to `executeFinalReviewAction`. */
    action: Exclude<BuildAction, FinalReviewAction>
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
            const run = await runBunTests({
                cwd: path,
                commands: bunTestCommands(context),
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
                content: { sha },
            })
            return
        }
        case 'run_red_check':
            return runRedCheck({ context, action })
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
        case 'undo_join':
            journal.append({
                kind: 'join_undone',
                ticket: action.ticket,
                role: null,
                content: {
                    shas: await undoJoin({
                        context,
                        ticket: action.ticket,
                        first_sha: action.first_sha,
                    }),
                },
            })
            return
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
            // Tracker-only steps; `executeAction` carries them out.
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
        case 'open_pull_request': {
            const { head, base, title, body } = action
            // A redo adopts the PR its first try opened before the crash.
            const adopted = context.step.redo
                ? await tracker.findOpenPullRequest({ head })
                : null
            const opened =
                adopted ??
                (await tracker.openPullRequest({ head, base, title, body }))
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
