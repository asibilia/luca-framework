/**
 * handoff-inbox hook — `SessionStart`, surfacing pending cross-repo work
 * orders addressed to this repo.
 *
 * This is the payoff for the handoff mailbox: open a session in repo B and it
 * TELLS you a work order from repo A is waiting, instead of that only being
 * discoverable by a human happening to type `luca handoff list`.
 *
 * ## Why SessionStart
 *
 * A work order is a fact about the repo that is true before the user says
 * anything, and it is most useful at the moment they are deciding what to
 * work on. Every other event is either too late or too noisy: `UserPromptSubmit`
 * would re-announce the same pending envelopes on every message, and
 * `PostToolUse` (the context-refresher's event) fires hundreds of times per
 * run. SessionStart fires once, at exactly the decision point.
 *
 * ## Why no matcher
 *
 * SessionStart's matcher selects the session SOURCE (`startup`, `resume`,
 * `clear`, `compact`). A pending work order is equally relevant to all four —
 * a resumed session has the same inbox as a fresh one — so the correct
 * spelling for "every source" is to omit the matcher entirely rather than
 * enumerate the four values and silently miss any source added later.
 *
 * ## Why background: false
 *
 * REQUIRED, not a default worth restating. `background: true` compiles to
 * `async: true` in settings.json, and an async hook's stdout is not read back
 * into the session — so `additionalContext` would be computed and discarded,
 * making the hook a silent no-op. The handler is fast enough to block on: it
 * takes two `existsSync` fast-exits before any mailbox I/O and does nothing at
 * all in a repo that has never used handoff (the overwhelmingly common case,
 * since this hook fires in EVERY repo the user opens).
 *
 * ## Failure-open, like every informational hook here
 *
 * The handler exits 0 with empty stdout on all seven of its failure paths. An
 * error banner at every session start in an unrelated repo is a far worse
 * outcome than a missed notification.
 */
import { defineHook } from '../../define/hook.ts'

export const handoffInboxHook = defineHook({
    id: 'handoff-inbox',
    description:
        'SessionStart handoff-inbox — surfaces pending cross-repo work orders addressed to this repo via additionalContext. Read-only: it never accepts or mutates an envelope.',
    event: 'SessionStart',
    // No matcher: fire for every session source (startup, resume, clear,
    // compact). See the docstring.
    runtime: 'bun-script',
    // Relative to $CLAUDE_PROJECT_DIR. The TS source of this handler lives at
    // packages/luca-tools/src/hooks/handoff-inbox/handler.ts and is BUNDLED
    // here by packages/luca/build.config.ts (directory-driven discovery, so
    // no build-config edit was needed to add it).
    handler: '.claude/hooks/handoff-inbox.ts',
    timeoutMs: 5000,
    // MUST stay false — an async hook's additionalContext never reaches the
    // session. See the docstring.
    background: false,
})
