/**
 * One agent turn (`runTurn`): the worktree guard around it, and how it
 * ended, journaled. Also the `launch_agent` and `follow_up_agent` steps,
 * which start a turn.
 */
import { need, ticketWorktree, type BuildContext } from './build-context'
import { mayEditTests, type BuildAction } from './decide-build'
import { closeSessions } from './session-close'

import type { AgentTurn } from '../agents/agent-launcher'
import {
    parseRoleResult,
    type AgentRole,
    type RoleResult,
} from '../agents/role-results'
import { DEFAULT_MODEL } from '../config/engine-config'
import { describeViolations } from '../guards/after-turn-check'
import { guardRoleOf } from '../guards/role-rules'
import { enforceAfterTurn, snapshotWorktree } from '../guards/worktree-state'
import { launchPick, type ModelReason } from '../jev/model-pick'
import type { AgentFailure, JournalRecord } from '../journal/journal-record'
import type { ReplayedWorktree } from '../journal/replay'
import { sessionSignal } from '../limits/plan-signals'
import { createAgentMessaging } from '../messages/agent-messaging'

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
        leave_out: context.state.prepare_made,
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

/** The session a record names, if any. */
const sessionOf = (record: JournalRecord): string | null => {
    switch (record.kind) {
        case 'agent_session':
            return record.content.session.session_id
        case 'agent_finished':
        case 'agent_failed':
            return record.content.session_id
        default:
            return null
    }
}

/** The model a session launched on, and why (`null` before #603). */
export type SessionModel = { model: string; model_reason: ModelReason | null }

/**
 * The model a session launched on, and why, from the journal: the
 * `agent_started` of the launch the session's first record came after (same
 * ticket and role), or of an earlier follow-up to it. `null` if the journal
 * names none, as in journals from before #600; every agent ran Opus then.
 *
 * @example
 * sessionModel({ records: journal.read(), session_id }) // { model: 'opus', model_reason: 'locked' }
 */
export const sessionModel = ({
    records,
    session_id,
}: {
    records: JournalRecord[]
    session_id: string
}): SessionModel | null => {
    const followed = records.findLast(
        (record) =>
            record.kind === 'agent_started' &&
            record.content.follow_up_of === session_id &&
            record.content.model !== null
    )
    const first = records.findIndex(
        (record) => sessionOf(record) === session_id
    )
    const { ticket, role } = records[first] ?? {}
    const started =
        followed ??
        (first === -1
            ? undefined
            : records
                  .slice(0, first)
                  .findLast(
                      (record) =>
                          record.kind === 'agent_started' &&
                          record.ticket === ticket &&
                          record.role === role &&
                          record.content.follow_up_of === null
                  ))
    if (started?.kind !== 'agent_started') return null
    const { model, model_reason } = started.content
    return model === null ? null : { model, model_reason }
}

/** A follow-up's model: its session's, else Opus, as before #600. */
export const followUpModel = ({
    records,
    session_id,
}: {
    records: JournalRecord[]
    session_id: string
}): SessionModel =>
    sessionModel({ records, session_id }) ?? {
        model: DEFAULT_MODEL,
        model_reason: null,
    }

export const launchAgent = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'launch_agent' }>
}) => {
    const { ticket, role, prompt, may_edit_tests } = action
    // The decision model's answer, journaled just before this step, picks
    // a routed role's model; a reviewer is locked on Opus. A redo keeps
    // the model its first try journaled.
    const { model, model_reason } = launchPick({
        records: context.journal.read(),
        state: context.state,
        config: context.config,
        ticket,
        role,
        step: context.step,
    })
    context.journal.append({
        kind: 'agent_started',
        ticket,
        role,
        content: { role, prompt, follow_up_of: null, model, model_reason },
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
                model,
            }),
    })
}

export const followUpAgent = async ({
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
    const { model, model_reason } = followUpModel({
        records: context.journal.read(),
        session_id,
    })
    context.journal.append({
        kind: 'agent_started',
        ticket,
        role,
        content: {
            role,
            prompt: message,
            follow_up_of: session_id,
            model,
            model_reason,
        },
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
