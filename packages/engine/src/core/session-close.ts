import type { AgentLauncher } from '../agents/agent-launcher'
import type { AgentRole } from '../agents/role-results'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun, type RunState } from '../journal/replay'

/** An agent session the journal knows of: its id, and whose it is. */
export type KnownSession = {
    session_id: string
    /** `null` for the final review's agents and the learner. */
    ticket: number | null
    role: AgentRole
}

/**
 * The sessions the journal knows of and has not closed, oldest first. Each
 * agent turn's end (`agent_finished`, `agent_failed`) names its session.
 *
 * @example
 * openSessionsIn({ records: journal.read() })
 * // [{ session_id: 'abc', ticket: 11, role: 'implementer' }]
 */
export const openSessionsIn = ({
    records,
}: {
    records: JournalRecord[]
}): KnownSession[] => {
    const known = new Map<string, KnownSession>()
    const closed = new Set<string>()
    for (const record of records) {
        if (record.kind === 'agent_session_closed') {
            closed.add(record.content.session_id)
            continue
        }
        if (
            record.kind !== 'agent_finished' &&
            record.kind !== 'agent_failed'
        ) {
            continue
        }
        const { session_id, role } = record.content
        if (session_id === null || known.has(session_id)) continue
        known.set(session_id, { session_id, ticket: record.ticket, role })
    }
    return [...known.values()].filter(
        ({ session_id }) => !closed.has(session_id)
    )
}

const isFixer = (role: AgentRole): boolean =>
    role === 'test-writer' || role === 'implementer'

type FailedTurn = { role: AgentRole; session_id: string | null }

/**
 * The sessions the decision step may still send a follow-up, each only
 * while its fix loop can reopen it:
 * - a ticket's test-writer until the red commit (the red check's loop);
 * - a ticket's implementer until the green commit, or a review fix round's
 *   until its fix commit (the gates' loop);
 * - the final review's fixers until the round's fix commit;
 * - a test-writer's or implementer's failed turn, until its next turn.
 *
 * Nothing else is ever followed up: reviewers, lenses, and the learner get
 * a fresh agent. A stuck or skipped ticket, the stuck final review, and a
 * stopped run (by the owner, billing, or crashes) keep no session.
 */
const reachableSessions = ({ state }: { state: RunState }): Set<string> => {
    const reachable = new Set<string>()
    if (
        state.stop !== null ||
        state.plan.billing_stopped !== null ||
        state.crash_stopped !== null
    ) {
        return reachable
    }
    const keep = (session_id: string | null | undefined) => {
        if (session_id !== null && session_id !== undefined) {
            reachable.add(session_id)
        }
    }
    const keepFailed = (failed: FailedTurn | null | undefined) => {
        if (failed !== null && failed !== undefined && isFixer(failed.role)) {
            keep(failed.session_id)
        }
    }
    for (const progress of Object.values(state.tickets)) {
        if (progress.stuck !== null || progress.skipped !== null) continue
        const { sessions, commits, review_fix } = progress
        keepFailed(progress.agent_failure)
        if (commits.red === null) keep(sessions['test-writer'])
        const fixing = review_fix !== null && commits.fix === null
        if (commits.green === null || fixing) keep(sessions.implementer)
    }
    const review = state.final_review
    if (
        review.stuck === null &&
        review.fix !== null &&
        review.commit === null
    ) {
        keepFailed(review.agent_failures['test-writer'])
        keepFailed(review.agent_failures.implementer)
        keep(review.sessions['test-writer'])
        keep(review.sessions.implementer)
    }
    return reachable
}

/**
 * The open sessions nothing can send a follow-up anymore: their step's
 * result was accepted and no fix loop can reopen them, or their step ended
 * another way (stuck, skipped, stopped, a crash-recovery redo). `busy`
 * sessions have a follow-up under way and stay open.
 *
 * @example
 * finishedSessions({ records: journal.read(), busy: [] })
 * // the test-writer's session, once the red commit is journaled
 */
export const finishedSessions = ({
    records,
    busy,
}: {
    records: JournalRecord[]
    busy: string[]
}): KnownSession[] => {
    const open = openSessionsIn({ records })
    if (open.length === 0) return []
    const reachable = reachableSessions({ state: replayRun({ records }) })
    return open.filter(
        ({ session_id }) =>
            !reachable.has(session_id) && !busy.includes(session_id)
    )
}

/**
 * Closes each session with the launcher (one it doesn't know, such as a
 * crashed engine's, is left as it is), then journals the close.
 */
export const closeSessions = async ({
    journal,
    launcher,
    sessions,
}: {
    journal: Journal
    launcher: AgentLauncher
    sessions: KnownSession[]
}): Promise<void> => {
    await Promise.all(
        sessions.map(async ({ session_id, ticket, role }) => {
            await launcher.closeSession({ session_id })
            journal.append({
                kind: 'agent_session_closed',
                ticket,
                role,
                content: { role, session_id },
            })
        })
    )
}
