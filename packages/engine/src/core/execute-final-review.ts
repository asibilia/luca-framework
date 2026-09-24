import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

import type { FinalReviewAction } from './decide-final-review'
import {
    commitIn,
    gatesIn,
    need,
    runTurn,
    type BuildContext,
} from './execute-build'

import type { Journal } from '../journal/journal'
import { replayRun, type RuleFile } from '../journal/replay'

/**
 * Carries out the final review's steps on the run branch's worktree: its
 * rounds, the lens agents, the fixers, their gates, the fix commit, and the
 * push. Every record has `ticket: null`. `decideFinalReview` picks the step.
 */

/**
 * Where a rule file from the engine config is: `~/...` under the home
 * folder, an absolute path as is, anything else in the run branch's
 * worktree (the repo as the run left it).
 */
export const rulePath = ({
    path,
    worktree,
    home,
}: {
    path: string
    worktree: string
    home: string
}): string => {
    if (path === '~') return home
    if (path.startsWith('~/')) return join(home, path.slice(2))
    return isAbsolute(path) ? path : join(worktree, path)
}

/**
 * Reads each rule file of the engine config, word for word, for the rules
 * lens (its sandbox can't read `~/.claude*`, so the engine inlines them).
 * A file it can't read gets `text: null`.
 */
const readRules = async ({
    paths,
    worktree,
}: {
    paths: string[]
    worktree: string
}): Promise<RuleFile[]> => {
    const home = homedir()
    const rules: RuleFile[] = []
    for (const path of paths) {
        const file = Bun.file(rulePath({ path, worktree, home }))
        let text: string | null = null
        try {
            text = (await file.exists()) ? await file.text() : null
        } catch {
            text = null
        }
        rules.push({ path, text })
    }
    return rules
}

/** The final review's findings, counted by severity. */
const counts = (findings: { severity: string }[]) => ({
    blocker: findings.filter(({ severity }) => severity === 'blocker').length,
    should_fix: findings.filter(({ severity }) => severity === 'should_fix')
        .length,
    nit: findings.filter(({ severity }) => severity === 'nit').length,
})

/**
 * Carries out one final review step and journals what happened. Agents run
 * in the run branch's worktree with the same turn machinery as a ticket's
 * (snapshot, after-turn check, result check, session, plan cut-offs,
 * stops). The launcher is handed the spec's number as the agent's ticket,
 * since the final review is about no one ticket.
 */
export const executeFinalReviewAction = async ({
    action,
    context,
}: {
    action: FinalReviewAction
    context: BuildContext
}): Promise<void> => {
    const { journal, git, launcher, state, config } = context
    const worktree = need({ value: state.run_branch, what: 'run branch' })
    const spec_number = need({ value: state.spec_number, what: 'spec' })
    switch (action.type) {
        case 'start_final_review': {
            const head_sha = await git.head({ cwd: worktree.path })
            journal.append({
                kind: 'final_review_started',
                ticket: null,
                role: null,
                content: {
                    round: action.round,
                    from_sha: action.from_sha,
                    head_sha,
                    lenses: action.lenses,
                    files: await git.filesBetween({
                        cwd: worktree.path,
                        from: action.from_sha,
                        to: head_sha,
                    }),
                    rules: await readRules({
                        paths: config.rule_files,
                        worktree: worktree.path,
                    }),
                },
            })
            return
        }
        case 'launch_lens': {
            const { lens, role, prompt } = action
            const round = state.final_review.round
            journal.append({
                kind: 'lens_started',
                ticket: null,
                role: null,
                content: { lens, round },
            })
            journal.append({
                kind: 'agent_started',
                ticket: null,
                role,
                content: { role, prompt, follow_up_of: null },
            })
            const result = await runTurn({
                context,
                worktree,
                ticket: null,
                role,
                may_edit_tests: false,
                start: (cwd) =>
                    launcher.launch({
                        role,
                        ticket: spec_number,
                        prompt,
                        cwd,
                        may_edit_tests: false,
                        config,
                        // Lenses are reviewers: no agent messages.
                        messaging: null,
                    }),
            })
            if (result === null || !('verdict' in result.result)) return
            journal.append({
                kind: 'lens_finished',
                ticket: null,
                role: null,
                content: {
                    lens,
                    round,
                    findings: counts(result.result.findings),
                },
            })
            return
        }
        case 'pass_final_review':
            journal.append({
                kind: 'final_review_passed',
                ticket: null,
                role: null,
                content: {},
            })
            return
        case 'start_final_fix':
            journal.append({
                kind: 'final_review_fixing',
                ticket: null,
                role: null,
                content: { round: action.round },
            })
            return
        case 'launch_final_fixer': {
            const { role, prompt, may_edit_tests } = action
            journal.append({
                kind: 'agent_started',
                ticket: null,
                role,
                content: { role, prompt, follow_up_of: null },
            })
            await runTurn({
                context,
                worktree,
                ticket: null,
                role,
                may_edit_tests,
                start: (cwd) =>
                    launcher.launch({
                        role,
                        ticket: spec_number,
                        prompt,
                        cwd,
                        may_edit_tests,
                        config,
                        // Every ticket is over, so nobody is left to talk to.
                        messaging: null,
                    }),
            })
            return
        }
        case 'follow_up_final_fixer': {
            const { role, session_id, message } = action
            journal.append({
                kind: 'agent_started',
                ticket: null,
                role,
                content: { role, prompt: message, follow_up_of: session_id },
            })
            await runTurn({
                context,
                worktree,
                ticket: null,
                role,
                // A follow-up keeps its launch's guards: only the
                // test-writer edits tests.
                may_edit_tests: role === 'test-writer',
                start: (cwd) =>
                    launcher.followUp({
                        session_id,
                        role,
                        ticket: spec_number,
                        message,
                        cwd,
                        config,
                    }),
            })
            return
        }
        case 'run_final_gates':
            return gatesIn({
                context,
                worktree,
                target: 'run_branch',
                ticket: null,
            })
        case 'commit_final_fix': {
            const snapshot = need({
                value: state.snapshot,
                what: 'spec snapshot',
            })
            return commitIn({
                context,
                cwd: worktree.path,
                ticket: null,
                stage: 'fix',
                message: action.message,
                mention_text: [
                    snapshot.spec.body,
                    ...snapshot.ticket_order.map(
                        (number) => snapshot.tickets[number]?.body ?? ''
                    ),
                ].join('\n'),
            })
        }
        case 'push_final_fixes':
            await git.push({ cwd: worktree.path, branch: action.branch })
            journal.append({
                kind: 'run_branch_pushed',
                ticket: null,
                role: null,
                content: {
                    branch: action.branch,
                    sha: await git.head({ cwd: worktree.path }),
                },
            })
            return
        case 'mark_final_review_stuck':
            journal.append({
                kind: 'final_review_stuck',
                ticket: null,
                role: null,
                content: { reason: action.reason, detail: action.detail },
            })
            return
    }
}

/**
 * The seam for replies (#366): when the person replies `ship` to a stuck
 * final review, the reply reader calls this. It journals
 * `final_review_shipped`, and the next `runEngine` on the journal opens the
 * PR with the findings still open listed at the top of its description.
 * A final review that isn't stuck (or was already shipped) gets nothing.
 *
 * @example
 * const shipped = shipFinalReview({ journal })
 * if (shipped.ok) await runEngine({ journal, tracker, git, launcher })
 */
export const shipFinalReview = ({
    journal,
}: {
    journal: Journal
}): { ok: true } | { ok: false; reason: string } => {
    const { final_review } = replayRun({ records: journal.read() })
    if (final_review.stuck === null) {
        return { ok: false, reason: 'The final review is not stuck.' }
    }
    if (final_review.shipped) {
        return { ok: false, reason: 'The final review was already shipped.' }
    }
    journal.append({
        kind: 'final_review_shipped',
        ticket: null,
        role: null,
        content: {},
    })
    return { ok: true }
}
