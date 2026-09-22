// Public surface for the cross-repo handoff mailbox.
// Subpath export: `@alecsibilia/luca-core/handoff` (see package.json exports).

// Constants
export {
    HANDOFF_DIR_NAME,
    HANDOFF_SCHEMA_VERSION,
    ENVELOPE_ID_RE,
    MAILBOX_DIR_MODE,
} from './constants.ts'

// Schemas + enums
export {
    HandoffStatus,
    HandoffCallbackTransport,
    HandoffOutcome,
    HandoffFailureReason,
    HandoffOriginSchema,
    HandoffTargetSchema,
    HandoffContextSchema,
    HandoffCallbackSchema,
    HandoffStatusHistoryEntrySchema,
    HandoffResultSchema,
    HandoffEnvelopeSchema,
    HandoffFilterSchema,
} from './schemas.ts'

// Configs
export {
    HANDOFF_TRANSITIONS,
    isLegalHandoffTransition,
} from './configs/handoff-transitions.ts'

// Helpers
export { generateEnvelopeId } from './helpers/generate-envelope-id.ts'
export { mailboxDirFor, mailboxPathFor } from './helpers/mailbox-path-for.ts'
export { createLocalMailboxTransport } from './helpers/create-local-mailbox-transport.ts'
export { createRemoteTransport } from './helpers/create-remote-transport.ts'
export { isAutoAcceptable } from './helpers/is-auto-acceptable.ts'

// Types
export type {
    HandoffFailure,
    HandoffOrigin,
    HandoffTarget,
    HandoffContext,
    HandoffCallback,
    HandoffStatusHistoryEntry,
    HandoffResult,
    HandoffEnvelope,
    HandoffFilter,
} from './schemas.ts'
export type { MailboxPathOptions } from './helpers/mailbox-path-for.ts'
export type {
    HandoffTransport,
    UpdateStatusOptions,
    HandoffEnvelopeOk,
    HandoffSendResult,
    HandoffReadResult,
    HandoffStatusResult,
    HandoffListResult,
} from './transport-contract.ts'
export type { LocalMailboxTransportOptions } from './helpers/create-local-mailbox-transport.ts'
export type { RemoteTransportOptions } from './helpers/create-remote-transport.ts'
