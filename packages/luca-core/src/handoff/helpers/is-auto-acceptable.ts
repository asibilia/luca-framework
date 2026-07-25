/**
 * Pure allowlist check for `pending -> accepted` auto-acceptance.
 *
 * The allowlist lives in the RECEIVING repo's `.luca/config.json` under
 * `handoff.autoAcceptFrom` (absolute repo paths). It is passed in explicitly —
 * no implicit config read, no implicit `homedir()` — matching the
 * caller-supplied-`cwd` convention in `pipeline-lock.ts`.
 *
 * SECURITY — this is CONVENIENCE, NOT SECURITY (context D2). `origin.repoPath`
 * is SELF-DECLARED by whoever wrote the envelope and is not authenticated, so
 * any process able to write the machine-global mailbox can set it to an
 * allowlisted value. The allowlist meaningfully prevents ACCIDENTAL cross-talk
 * between the user's own repos; it does not defend against a hostile local
 * process (which could equally rewrite the config or the repo source).
 *
 * The real control is context D3: auto-accept advances STATUS ONLY. It never
 * auto-plans and never auto-executes, and envelope free text is never
 * interpolated into instruction text.
 *
 * An absent or empty allowlist DENIES everything — the safe default is that a
 * human accepts each envelope.
 */
import type { HandoffEnvelope } from '../schemas.ts'

export function isAutoAcceptable(
    envelope: HandoffEnvelope,
    allowlist?: string[]
): boolean {
    if (!allowlist || allowlist.length === 0) return false
    // Only a `pending` envelope is a candidate; every other status has either
    // already been triaged or is terminal.
    if (envelope.status !== 'pending') return false
    return allowlist.includes(envelope.origin.repoPath)
}
