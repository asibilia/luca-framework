/**
 * The empty-homedir guard, as a pure function.
 *
 * This is one `if` and it lives in its own module for a specific reason: it
 * is the only one of the hook's seven degradation paths that CANNOT be
 * reached by spawning a process.
 *
 * `os.homedir()` does not read `HOME` alone — on POSIX it falls back to the
 * passwd database when `HOME` is unset or empty, so a test that spawns the
 * handler with `HOME=''` gets the developer's REAL home back and exercises
 * nothing. The guard would look covered while never running. Extracting it
 * makes the check deterministically testable with the input that actually
 * matters.
 *
 * ## What the guard prevents
 *
 * `mailboxDirFor` is pure and simply joins its `homedir` with the mailbox dir
 * name. Given an EMPTY homedir it returns the RELATIVE path `.luca/handoff`,
 * and a relative path resolves against `process.cwd()`. An unguarded handler
 * running in a repo that has a `.luca/handoff/` directory of its own would
 * therefore read that repo-local directory AS IF it were the machine-global
 * mailbox and surface its contents — envelopes addressed by an untrusted
 * writer, from a location no one intended to be a mailbox. This was filed as
 * a live residual in the previous phase's code review and is closed here.
 *
 * Returning `null` (bail out) is correct rather than substituting some other
 * root: with no home directory there is no mailbox, so there is nothing to
 * say, and a hook with nothing to say must say nothing.
 */
import { isAbsolute } from 'node:path'

import { mailboxDirFor } from '@alecsibilia/luca-core/handoff'

/**
 * Resolve the absolute mailbox directory for a home directory.
 *
 * The property enforced is ABSOLUTENESS, not non-emptiness. Empty was only
 * the most obvious way to get a relative join; `HOME="."` and `HOME="tmp"`
 * are equally sufficient, and on POSIX `os.homedir()` returns `$HOME` when it
 * is set, so whoever launches the session chooses it. A relative result would
 * resolve against `process.cwd()` and make the CURRENT REPO's
 * `.luca/handoff/` the mailbox — a directory that, unlike `~/.luca/handoff`,
 * is repo-local and writable by the agent's own Write tool and by anything
 * that lands in a checkout. A checked-in `.luca/handoff/*.json` would then be
 * a prompt-injection delivery vector needing no mailbox access at all.
 * Testing the emptiness of the input instead of the absoluteness of the
 * result left that entire class open.
 *
 * @param home - the value of `os.homedir()`; may be empty, whitespace, or a
 *   relative path.
 * @returns the absolute mailbox directory, or `null` when `home` is unusable
 *   and the caller must bail out.
 *
 * @example
 * ```typescript
 * const dir = resolveMailboxDir(homedir())
 * if (dir === null) return 0 // nothing to read, stay silent
 * ```
 */
export function resolveMailboxDir(home: string): string | null {
    if (home.trim().length === 0 || !isAbsolute(home)) return null
    return mailboxDirFor({ homedir: home })
}
