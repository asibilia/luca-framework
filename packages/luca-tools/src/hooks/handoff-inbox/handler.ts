#!/usr/bin/env bun
/**
 * handoff-inbox handler — `SessionStart` hook that surfaces pending
 * cross-repo work orders addressed to this repo.
 *
 * The decision logic lives in the pure `renderInboxNotice()`; this handler is
 * glue around it:
 *
 *   1. Read the SessionStart payload from stdin (parsed only to detect a
 *      malformed payload — no field of it is used).
 *   2. Fast-exit unless `cwd/.luca/` exists.
 *   3. Guard an empty `os.homedir()`.
 *   4. Fast-exit unless the mailbox directory exists.
 *   5. `list({ status: 'pending', targetRepoPath: cwd })`.
 *   6. Render, and emit via `additionalContext`.
 *
 * ## READ-ONLY — this hook never accepts a work order
 *
 * It calls `transport.list` and NOTHING else. There is no `updateStatus` path,
 * no read of `handoff.autoAcceptFrom`, and the `autoAcceptable` annotation is
 * never computed or shown. `pending -> accepted` stays an explicit, human-
 * driven `luca handoff accept`. An agent that auto-accepted work addressed to
 * it by another repo, at turn zero, before the user said anything, would be
 * taking an unauthenticated instruction from an untrusted source. `list` is
 * also the only transport method that creates nothing on disk — the module's
 * sole `mkdirSync` is inside `send` — so this handler is incapable of adding,
 * removing or modifying a mailbox file even by accident.
 *
 * ## Degrade SILENTLY — the failure mode that matters most
 *
 * This hook fires at EVERY session start in EVERY repo the user opens,
 * including the overwhelming majority that have never heard of handoff. A
 * stack trace or an error banner there is this feature's worst possible
 * regression: it would be strictly worse than not shipping the feature. Every
 * one of the seven entry paths below therefore exits 0 with EMPTY stdout:
 *
 *   1. `cwd/.luca/` missing            -> fast-exit (step 2)
 *   2. mailbox directory missing       -> fast-exit (step 4)
 *   3. an envelope file is corrupt     -> `list` skips it; may yield an empty
 *                                          list, which renders `null`
 *   4. `os.homedir()` not ABSOLUTE     -> guard (step 3), see below
 *   5. stdin malformed                 -> guard (step 1)
 *   6. non-ok `HandoffListResult`      -> swallowed (step 5); all 8 failure
 *                                          reasons collapse to silence
 *   7. anything throws at all          -> the `main().then(ok, exit0)`
 *                                          catch-all at the bottom, which
 *                                          reaches the luca-core graph only
 *                                          because that import is DYNAMIC
 *                                          (see the note above `main`)
 *
 * ### Why the homedir guard is load-bearing, not defensive padding
 *
 * `mailboxDirFor` is pure over a caller-supplied homedir and simply joins, so
 * a NON-ABSOLUTE homedir yields a RELATIVE path such as `.luca/handoff` — and
 * a relative path resolves against `process.cwd()`. Without this guard a
 * session started with `HOME` unset, or set to `.`, in a repo that has a
 * `.luca/handoff/` directory of its own would read that repo-local directory
 * AS IF it were the machine-global mailbox and surface its contents — making
 * a checked-in file an injection vector. Bailing out is correct rather than
 * falling back to some other root: with no home directory there is no
 * mailbox to read, so there is nothing to say.
 *
 * ## Performance
 *
 * Budget is well under the 5000 ms hook timeout, and the ordering above is
 * what holds it: both fast-exits are a single `existsSync` and both come
 * BEFORE any directory read. In a repo that has never used handoff the
 * handler does one stat and exits, so the cost in the common case is
 * essentially bun startup.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { renderInboxNotice } from './render-inbox-notice.ts'

/** Newline, by code point — this module never writes a source-level escape. */
const NL = String.fromCharCode(10)

/**
 * Every import that can reach `@alecsibilia/luca-core/handoff` is DYNAMIC and
 * lives inside `main`.
 *
 * `main().then(ok, exit0)` covers everything thrown inside `main`, but NOT a
 * throw during module EVALUATION. A static import of the transport (or of
 * `resolve-mailbox-dir.ts`, which statically imports `mailboxDirFor` from the
 * same module) puts that whole graph in the eval phase, outside the
 * catch-all: a bad bundle, a version skew or a module-scope initializer that
 * throws would print an uncaught stack trace at EVERY session start in EVERY
 * repo the user opens — the exact availability regression this hook's whole
 * design exists to avoid. Deferring also keeps the cost behind both
 * `existsSync` fast-exits, so the common case (a repo that has never heard of
 * handoff) never loads it at all.
 *
 * `render-inbox-notice.ts` stays static: its only luca-core import is
 * `import type`, which is erased, so it adds nothing to the runtime graph.
 */
async function main(): Promise<number> {
    const raw = await Bun.stdin.text()
    if (raw.trim()) {
        try {
            // No field of the payload is needed — this hook has no matcher
            // and fires for every session source. We parse only so a
            // malformed payload becomes a silent exit rather than a throw.
            JSON.parse(raw)
        } catch {
            return 0
        }
    }

    const cwd = process.cwd()

    // Fast-exit #1: not a luca repo. This is the common case across all the
    // repos a user opens, and it costs one stat.
    if (!existsSync(join(cwd, '.luca'))) return 0

    // Guard the empty homedir BEFORE it can be joined into a relative path.
    // See `resolve-mailbox-dir.ts` — this closes the residual from the
    // previous phase and is not boilerplate.
    const home = homedir()
    const { resolveMailboxDir } = await import('./resolve-mailbox-dir.ts')
    const mailboxDir = resolveMailboxDir(home)
    if (mailboxDir === null) return 0

    // Fast-exit #2: no mailbox on this machine yet. Also one stat, and still
    // before any directory read.
    if (!existsSync(mailboxDir)) return 0

    const { createLocalMailboxTransport } = await import(
        '@alecsibilia/luca-core/handoff'
    )
    const transport = createLocalMailboxTransport({ homedir: home })
    const listed = await transport.list({
        status: 'pending',
        targetRepoPath: cwd,
    })

    // Swallow every transport failure. A hook is not the place to report an
    // unreadable mailbox — the explicit `luca handoff list` surfaces it with
    // its reason token, where a human asked the question.
    if (!listed.ok) return 0

    const notice = renderInboxNotice(listed.envelopes)
    if (notice === null) return 0

    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'SessionStart',
                additionalContext: notice,
            },
        }) + NL
    )
    return 0
}

main().then(
    (code) => process.exit(code),
    (err) => {
        // Catch-all: any unexpected throw exits 0 with nothing on stdout and
        // nothing on stderr. Users must never see this hook's internals — an
        // informational notice is not worth a banner at session start.
        void err
        process.exit(0)
    }
)
