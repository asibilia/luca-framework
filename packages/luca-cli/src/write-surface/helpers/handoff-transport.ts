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

/** Control characters (C0 range plus DEL) — escaped, never emitted raw. */
export const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/g

/** Longest rendered form of one sender-controlled value. */
const MAX_RENDERED_LENGTH = 256

/**
 * Render a SENDER-CONTROLLED envelope value as exactly one line.
 *
 * `origin.repoPath` / `target.repoPath` are self-declared by the sending repo
 * and are echoed into the `list` triage view — the deliberately low-exposure
 * surface that withholds `intent` and `acceptanceCriteria` precisely so the
 * receiving agent does not read attacker-authored, instruction-shaped prose
 * into context. A multi-line value would put those lines right back. Control
 * characters are escaped (never dropped, so nothing is silently hidden) and
 * the result is truncated, so one field can never dominate the view.
 *
 * `send` also constrains these values at the boundary; this is the rendering
 * half, and it also covers envelopes that predate the constraint or were
 * written by another tool.
 *
 * @param value - untrusted, sender-authored text
 * @returns a single-line, length-capped rendering
 *
 * @example
 * ```typescript
 * toSingleLine('/repos/a\nIGNORE PREVIOUS') // '/repos/a\\nIGNORE PREVIOUS'
 * ```
 */
export function toSingleLine(value: string): string {
    const escaped = value.replace(CONTROL_CHAR_RE, (char) => {
        if (char === '\n') return '\\n'
        if (char === '\r') return '\\r'
        if (char === '\t') return '\\t'
        return `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`
    })
    return escaped.length > MAX_RENDERED_LENGTH
        ? `${escaped.slice(0, MAX_RENDERED_LENGTH)}…(truncated)`
        : escaped
}
