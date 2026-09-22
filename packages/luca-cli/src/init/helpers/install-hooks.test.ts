/**
 * `mergeLucaHookSettings` — coverage for the `SessionStart` event.
 *
 * The handoff-inbox hook is the first luca hook on `SessionStart`, so this is
 * the first time the merge has had to add a luca entry to that event in a
 * consumer's `.claude/settings.json`. The consumer case that matters is the
 * one where the user already authored their OWN SessionStart hook: the merge
 * must add luca's entry alongside it, never on top of it. Silently dropping a
 * user's hook during `luca init` is the kind of damage that is only noticed
 * long after the fact.
 *
 * The merge identifies its own entries by the `/.claude/hooks/` substring in
 * the command, so the fixtures below deliberately use a user command that does
 * NOT contain that marker.
 */
import { describe, expect, test } from 'bun:test'

import { mergeLucaHookSettings } from './install-hooks.ts'

const LUCA_SESSION_START_COMMAND =
    'bun "$CLAUDE_PROJECT_DIR"/.claude/hooks/handoff-inbox.ts'

/** A user-authored SessionStart hook with no luca marker in its command. */
const userSessionStart = {
    hooks: {
        SessionStart: [
            {
                hooks: [
                    {
                        type: 'command' as const,
                        command: 'echo user-owned-session-start',
                    },
                ],
            },
        ],
    },
}

/** The bundled slice luca ships for SessionStart. */
const bundledSessionStart = {
    hooks: {
        SessionStart: [
            {
                hooks: [
                    {
                        type: 'command' as const,
                        command: LUCA_SESSION_START_COMMAND,
                        timeout: 5,
                    },
                ],
            },
        ],
    },
}

describe('mergeLucaHookSettings — SessionStart', () => {
    test('adds the luca entry to a settings.json with no hooks at all', () => {
        const merged = mergeLucaHookSettings({}, bundledSessionStart)
        const commands = (merged.hooks?.SessionStart ?? []).flatMap((e) =>
            e.hooks.map((h) => h.command)
        )
        expect(commands).toEqual([LUCA_SESSION_START_COMMAND])
    })

    test('a user-authored SessionStart entry SURVIVES the merge', () => {
        const merged = mergeLucaHookSettings(
            userSessionStart,
            bundledSessionStart
        )
        const commands = (merged.hooks?.SessionStart ?? []).flatMap((e) =>
            e.hooks.map((h) => h.command)
        )

        // Both present — the user's entry is not replaced, and luca's is
        // actually added rather than the merge simply passing `existing`
        // through untouched.
        expect(commands).toContain('echo user-owned-session-start')
        expect(commands).toContain(LUCA_SESSION_START_COMMAND)
        expect(commands).toHaveLength(2)
        // User entries come first; luca's are appended.
        expect(commands[0]).toBe('echo user-owned-session-start')
    })

    test('re-running the merge is idempotent', () => {
        // `luca init` is documented as safe to re-run. A prior luca entry is
        // recognised by its marker and replaced, not duplicated.
        const once = mergeLucaHookSettings(userSessionStart, bundledSessionStart)
        const twice = mergeLucaHookSettings(once, bundledSessionStart)
        const commands = (twice.hooks?.SessionStart ?? []).flatMap((e) =>
            e.hooks.map((h) => h.command)
        )

        expect(commands).toHaveLength(2)
        expect(
            commands.filter((c) => c === LUCA_SESSION_START_COMMAND)
        ).toHaveLength(1)
        expect(commands).toContain('echo user-owned-session-start')
    })

    test('unrelated events are preserved untouched', () => {
        const existing = {
            hooks: {
                ...userSessionStart.hooks,
                Stop: [
                    {
                        hooks: [
                            {
                                type: 'command' as const,
                                command: 'echo user-stop',
                            },
                        ],
                    },
                ],
            },
        }
        const merged = mergeLucaHookSettings(existing, bundledSessionStart)
        expect(merged.hooks?.Stop).toEqual(existing.hooks.Stop)
    })
})
