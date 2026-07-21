/**
 * Transport seam for the `luca handoff` write-surface handlers.
 *
 * The luca-core handoff module is deliberately pure over a CALLER-SUPPLIED
 * homedir (`mailbox-path-for.ts`) — it never calls `os.homedir()` itself, so a
 * test can address a temp mailbox and never the real one. This module is the
 * one place in luca-cli that closes that seam with the real `os.homedir()`,
 * and every handler threads `ctx.homedir` through it. A handler that called
 * `homedir()` directly would make its probes write into the developer's REAL
 * `~/.luca/handoff/`.
 *
 * `packages/luca-core/src/handoff/` is NOT modified by this phase — this
 * module only consumes its public surface.
 */
import { homedir as osHomedir } from 'node:os'

import {
    createLocalMailboxTransport,
    mailboxDirFor,
    type HandoffFailure,
    type HandoffTransport,
} from '@alecsibilia/luca-core/handoff'

/**
 * Single-line escaping of sender-controlled envelope text.
 *
 * The implementation MOVED to `@alecsibilia/luca-tools/handoff-render` and is
 * re-exported here so the existing import sites in `luca-handoff-list.ts` and
 * `luca-handoff-accept.ts` stay byte-unchanged.
 *
 * The move was forced by the dependency graph. The SessionStart
 * handoff-inbox hook lives in luca-tools and renders the same untrusted
 * envelope fields, but luca-cli sits ABOVE luca-tools so the hook cannot
 * import from here; luca-core's `handoff/` module is frozen by this phase's
 * scope fence; and a second copy of a security control is not acceptable
 * (two copies drift, and this one is the anti-injection boundary). Moving it
 * down to the shared package is the only placement satisfying all three.
 *
 * There is exactly one definition of `toSingleLine` in the monorepo and it is
 * NOT in this file — see `luca-tools/src/handoff-render/to-single-line.ts`.
 */
export {
    toSingleLine,
    CONTROL_CHAR_RE,
} from '@alecsibilia/luca-tools/handoff-render'

/** Optional homedir override — see {@link resolveHandoffTransport}. */
export interface ResolveHandoffTransportOptions {
    /**
     * Home directory hosting the mailbox. Omitted in every production call
     * (falls back to `os.homedir()`); supplied only by tests/probes.
     */
    homedir?: string
}

/** A ready transport plus the absolute mailbox directory it addresses. */
export interface ResolvedHandoffTransport {
    transport: HandoffTransport
    mailboxDir: string
}

/**
 * Build the local mailbox transport for the given (or real) homedir.
 *
 * @param opts - Optional `{ homedir }` override. Defaults to `os.homedir()`.
 * @returns The transport and the absolute mailbox directory it writes to.
 *
 * @example
 * ```typescript
 * const { transport, mailboxDir } = resolveHandoffTransport({ homedir: tmp })
 * const sent = await transport.send(envelope)
 * ```
 */
export function resolveHandoffTransport(
    opts?: ResolveHandoffTransportOptions
): ResolvedHandoffTransport {
    const home = opts?.homedir ?? osHomedir()
    return {
        transport: createLocalMailboxTransport({ homedir: home }),
        mailboxDir: mailboxDirFor({ homedir: home }),
    }
}

/**
 * Render a transport failure as one CLI-safe line.
 *
 * The machine-readable `reason` token is emitted VERBATIM and first: the
 * transport's prose messages do not all contain their own reason word (e.g. a
 * `conflict` reads "envelope … changed since it was read"), so callers and
 * probes that key on the token would otherwise have nothing to match.
 *
 * The `message` is transport-authored (never envelope free text passed
 * through unescaped by this function's own doing) — it is displayed, never
 * interpolated into instruction text.
 *
 * @param failure - Any `{ ok: false, reason, message }` from the 8-member
 *   `HandoffFailureReason` union.
 * @returns `handoff failed [<reason>]: <message>`
 */
export function formatHandoffFailure(failure: HandoffFailure): string {
    return `handoff failed [${failure.reason}]: ${failure.message}`
}
