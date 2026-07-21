import { join } from 'node:path'

import { ENVELOPE_ID_RE, HANDOFF_DIR_NAME } from '../constants.ts'

/**
 * Caller-supplied home directory.
 *
 * Deliberately NOT an implicit `homedir()` — pure functions over a
 * caller-supplied root, mirroring `pipeline-lock.ts`'s caller-supplied `cwd`,
 * so tests address a temp directory and never the real mailbox.
 */
export interface MailboxPathOptions {
    homedir: string
}

/** Absolute path of the mailbox directory under the given homedir. */
export function mailboxDirFor(opts: MailboxPathOptions): string {
    return join(opts.homedir, HANDOFF_DIR_NAME)
}

/**
 * Absolute path of one envelope file, or `null` when the id is illegal.
 *
 * SECURITY — the id reaches this helper from argv and from envelope JSON, and
 * it is concatenated into a filesystem path. An id such as
 * `../../.claude/settings` would resolve straight into `~/.claude/`, the exact
 * directory `HOME_DENIED_SUBDIRS` exists to protect, letting a reader exfiltrate
 * it and an atomic `updateStatus` write overwrite it. Enforcing the charset only
 * at generation is therefore not enough: it is enforced HERE, on the consumption
 * side, and every transport method short-circuits to `not-found` on `null` so the
 * caller learns nothing about whether the traversal target exists.
 */
export function mailboxPathFor(
    id: string,
    opts: MailboxPathOptions
): string | null {
    if (!ENVELOPE_ID_RE.test(id)) return null
    return join(mailboxDirFor(opts), `${id}.json`)
}
