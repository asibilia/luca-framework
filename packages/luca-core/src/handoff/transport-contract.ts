/**
 * The `HandoffTransport` CONTRACT — the surface every transport implements.
 *
 * Deliberately separate from any concrete implementation: the local mailbox
 * and the remote stub both implement this shape today, and the phase-5 hub
 * daemon will be a third. Keeping the interface inside
 * `create-local-mailbox-transport.ts` would make every other implementation
 * import its contract from a sibling implementation and would freeze that
 * file path into the public type surface.
 *
 * The transport NEVER throws for an expected condition — every failure is a
 * resolved `{ ok: false, reason, message }` drawn from the EXHAUSTIVE 8-member
 * `HandoffFailureReason` union in `schemas.ts`.
 */
import type {
    HandoffEnvelope,
    HandoffFailure,
    HandoffFilter,
    HandoffResult,
    HandoffStatus,
} from './schemas.ts'

/** Successful single-envelope outcome (`send`, `read`, `updateStatus`). */
export interface HandoffEnvelopeOk {
    ok: true
    envelope: HandoffEnvelope
}

export type HandoffSendResult = HandoffEnvelopeOk | HandoffFailure
export type HandoffReadResult = HandoffEnvelopeOk | HandoffFailure
export type HandoffStatusResult = HandoffEnvelopeOk | HandoffFailure

export type HandoffListResult =
    | { ok: true; envelopes: HandoffEnvelope[] }
    | HandoffFailure

/**
 * Third argument to `updateStatus`.
 *
 * `expectedUpdatedAt` is the compare-and-set token: it is the envelope's OWN
 * `updatedAt` as returned by a prior `read()` — never a `statSync` mtime.
 *
 * CAS SCOPE — this is OPTIMISTIC concurrency, not mutual exclusion. The
 * compare and the write are two separate, unsynchronized filesystem
 * operations and there is NO lock file (context E4), so two writers that
 * interleave between the compare and the rename can still both pass CAS and
 * the later rename wins — a lost update. What CAS does guarantee is that a
 * writer holding a token from a read that has ALREADY been superseded on disk
 * is rejected with `conflict`; that covers the realistic case (repo B accepts
 * an envelope minutes after repo A wrote it). Callers that need true
 * serialization must layer it above this transport.
 */
export interface UpdateStatusOptions {
    expectedUpdatedAt: string
    /** REQUIRED when transitioning to `complete` — it IS the callback payload. */
    result?: HandoffResult
    /** Optional operator note appended to `statusHistory`. UNTRUSTED text. */
    note?: string
}

/**
 * The transport surface. Both `createLocalMailboxTransport` and
 * `createRemoteTransport` return this shape, so a caller holding a
 * `HandoffTransport` needs no knowledge of which one it has.
 */
export interface HandoffTransport {
    send(envelope: unknown): Promise<HandoffSendResult>
    /**
     * Envelopes matching `filter`, ordered by `createdAt` ASCENDING with `id`
     * as the tiebreak. The order is part of the contract: callers may rely on
     * it being total and stable rather than filesystem-defined.
     */
    list(filter?: HandoffFilter): Promise<HandoffListResult>
    read(id: string): Promise<HandoffReadResult>
    updateStatus(
        id: string,
        to: HandoffStatus,
        opts: UpdateStatusOptions
    ): Promise<HandoffStatusResult>
}
