/**
 * Remote handoff transport — STUBBED this phase (context L3: Bun only, no
 * external relay, no vendored dependency).
 *
 * Every method RESOLVES `{ ok: false, reason: 'not-implemented' }` and NEVER
 * throws (context E1). This is a deliberate deviation from the original brief's
 * "throws NotImplemented": every luca-core precedent returns a value for an
 * expected condition (`AcquireResult` in `pipeline-lock.ts`, the `Unreachable`
 * sentinel in `runner/protocol.ts`, `readVerificationResult -> null`). A caller
 * that switches on `reason` handles the stub with no try/catch.
 *
 * The factory shape is identical to `createLocalMailboxTransport`, so a caller
 * holding a `HandoffTransport` needs no knowledge of which one it has.
 */
import type {
    HandoffListResult,
    HandoffReadResult,
    HandoffSendResult,
    HandoffStatusResult,
    HandoffTransport,
    UpdateStatusOptions,
} from '../transport-contract.ts'

import type { HandoffFailure, HandoffFilter, HandoffStatus } from '../schemas.ts'

/** Address of the (future) remote relay. Recorded, never dialed this phase. */
export interface RemoteTransportOptions {
    address?: string
}

function notImplemented(method: string): HandoffFailure {
    return {
        ok: false,
        reason: 'not-implemented',
        message: `remote handoff transport is not implemented — "${method}" is unavailable; use the local mailbox transport`,
    }
}

export function createRemoteTransport(
    opts?: RemoteTransportOptions
): HandoffTransport {
    // `opts` is accepted now so phase-5 wiring does not change the signature.
    void opts

    return {
        async send(_envelope: unknown): Promise<HandoffSendResult> {
            return notImplemented('send')
        },
        async list(_filter?: HandoffFilter): Promise<HandoffListResult> {
            return notImplemented('list')
        },
        async read(_id: string): Promise<HandoffReadResult> {
            return notImplemented('read')
        },
        async updateStatus(
            _id: string,
            _to: HandoffStatus,
            _options: UpdateStatusOptions
        ): Promise<HandoffStatusResult> {
            return notImplemented('updateStatus')
        },
    }
}
