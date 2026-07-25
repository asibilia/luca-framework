import type { HandoffStatus } from '../schemas.ts'

/**
 * Allowed handoff status transitions.
 *
 * Source-of-truth for what `HandoffTransport.updateStatus` — the SOLE write
 * path — will permit. Shape-copied from `PIPELINE_TRANSITIONS`: entries map
 * FROM → the set of ALLOWED next statuses, and the table is a config consulted
 * by the write handler, deliberately NOT a Zod refinement (an envelope at rest
 * is always valid; only the move between statuses is constrained).
 *
 * `failed → in-progress` is the retry edge and `failed → cancelled` is its
 * terminal exit: without the latter, a permanently-failed envelope would be
 * stuck non-terminal forever in a machine-global directory that has no
 * `prune` (context E4). `complete`, `rejected` and `cancelled` are terminal.
 */
export const HANDOFF_TRANSITIONS: Record<HandoffStatus, HandoffStatus[]> = {
    pending: ['accepted', 'rejected', 'cancelled'],
    accepted: ['in-progress', 'rejected', 'cancelled'],
    'in-progress': ['complete', 'failed', 'cancelled'],
    complete: [],
    rejected: [],
    failed: ['in-progress', 'cancelled'], // retry, or give up for good
    cancelled: [],
}

export function isLegalHandoffTransition(
    from: HandoffStatus,
    to: HandoffStatus
): boolean {
    return HANDOFF_TRANSITIONS[from].includes(to)
}
