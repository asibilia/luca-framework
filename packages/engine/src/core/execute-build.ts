import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import uniq from 'lodash/uniq'

import type { BuildAction } from './decide-build'

import type { AgentLauncher } from '../agents/agent-launcher'
import { parseRoleResult } from '../agents/role-results'
import type { EngineConfig } from '../config/engine-config'
import { runGates } from '../gates/gate-runner'
import { newCodeFiles, importStem, scanLeftovers } from '../gates/leftover-scan'
import { checkRed } from '../gates/red-check'
import { runTests, testFilesAmong } from '../gates/test-runner'
import type { GitAdapter } from '../git/git-adapter'
import type { Journal } from '../journal/journal'
import {
    replayRun,
    type ReplayedWorktree,
    type RunState,
} from '../journal/replay'
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

const launchAgent = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'launch_agent' }>
}) => {
    const { ticket, role, prompt, may_edit_tests } = action
    const { path } = ticketWorktree({ state: context.state, ticket })
    context.journal.append({
        kind: 'agent_started',
        ticket,
        role,
        content: { role, prompt },
    })
    const turn = await context.launcher.launch({
        role,
        ticket,
        prompt,
        cwd: path,
        may_edit_tests,
    })
    const checked = turn.ok
        ? parseRoleResult({ role, output: turn.structured_output })
        : turn
    if (!checked.ok) {
        context.journal.append({
            kind: 'agent_failed',
            ticket,
            role,
            content: { role, error: checked.error },
        })
        return
    }
    context.journal.append({
        kind: 'agent_finished',
        ticket,
        role,
        content: checked.value,
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
        case 'run_red_check':
            return runRedCheck({ context, action })
        case 'commit_ticket':
            return commitTicket({ context, action })
        case 'run_gates': {
            const cwd =
                action.target === 'ticket'
                    ? ticketWorktree({ state, ticket: action.ticket }).path
                    : need({ value: state.run_branch, what: 'run branch' }).path
            const result = await runGates({
                cwd,
                config,
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
            return
    }
}
