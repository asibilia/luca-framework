/**
 * Doctor check: the luca statusline is installed and registered.
 *
 * `luca init` copies the bundled statusline script to
 * `~/.claude/luca-statusline.ts` and registers it as `statusLine` in
 * `~/.claude/settings.json`. Machines initialized by older luca versions
 * (≤13.0.1 shipped the script in the tarball but never registered it)
 * end up with no statusline — this check surfaces that gap.
 *
 * Deliberate user choices are respected as passes, mirroring the
 * installer's own merge policy:
 * - `statusLine: null` — the user disabled the statusline.
 * - A non-luca `statusLine` command — user-authored, never clobbered.
 *
 * `fix()` (via `luca doctor --fix`) and `luca statusline install` both
 * delegate to the same idempotent `installStatusline` helper `luca init`
 * uses.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { defaultClaudeHome, installStatusline } from '../../../init'
import type { CheckResult, DoctorCheck, DoctorFixResult } from '../types'

const CHECK_NAME = 'Claude statusline'

/** Installed script name — mirrors install-statusline's marker. */
const STATUSLINE_SCRIPT_NAME = 'luca-statusline.ts'

/** Classified state of the statusline installation. */
export type StatuslineState =
    | 'no-claude-home' // ~/.claude absent — Claude Code not on this machine
    | 'registered' // luca statusline registered and script present
    | 'script-missing' // registered, but the script file is gone
    | 'user-disabled' // statusLine: null — deliberate opt-out
    | 'user-custom' // non-luca statusLine — user-authored, respected
    | 'not-registered' // no statusLine entry at all
    | 'unreadable-settings' // settings.json exists but cannot be parsed

/**
 * Classify the statusline installation state for a Claude home directory.
 *
 * Pure with respect to its inputs (`settingsRaw` is the settings.json
 * text or null when absent; `scriptExists` is whether the installed
 * script file is present) — exported for testability.
 *
 * @param settingsRaw - Raw settings.json contents, or null when the file is absent
 * @param scriptExists - Whether `<home>/luca-statusline.ts` exists
 * @returns The classified {@link StatuslineState}
 *
 * @example
 * ```typescript
 * classifyStatuslineState('{"statusLine":null}', true) // 'user-disabled'
 * classifyStatuslineState(null, false) // 'not-registered'
 * ```
 */
export function classifyStatuslineState(
    settingsRaw: string | null,
    scriptExists: boolean
): StatuslineState {
    if (settingsRaw === null) return 'not-registered'

    let parsed: unknown
    try {
        parsed = JSON.parse(settingsRaw)
    } catch {
        return 'unreadable-settings'
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        return 'unreadable-settings'

    const statusLine = (parsed as Record<string, unknown>).statusLine
    if (statusLine === undefined) return 'not-registered'
    if (statusLine === null) return 'user-disabled'
    if (typeof statusLine !== 'object' || Array.isArray(statusLine))
        return 'user-custom'

    const command = (statusLine as Record<string, unknown>).command
    // Substring (not exact-canonical) test on purpose: a user wrapper
    // that pipes the luca script through a filter is the documented
    // opt-in path and counts as wired, not as missing.
    if (
        typeof command === 'string' &&
        command.includes(STATUSLINE_SCRIPT_NAME)
    ) {
        return scriptExists ? 'registered' : 'script-missing'
    }
    return 'user-custom'
}

/** Read settings.json text, or null when absent. */
async function readSettingsRaw(claudeHome: string): Promise<string | null> {
    const settingsPath = join(claudeHome, 'settings.json')
    if (!existsSync(settingsPath)) return null
    return readFile(settingsPath, 'utf-8')
}

/**
 * Doctor check: warn when the Claude statusline is not installed or its
 * script file has gone missing. `luca doctor --fix` re-runs the same
 * installer as `luca init` / `luca statusline install`.
 */
export const statuslineRegisteredCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'global',

    async run(): Promise<CheckResult> {
        const claudeHome = defaultClaudeHome()

        if (!existsSync(claudeHome)) {
            return {
                name: CHECK_NAME,
                status: 'pass',
                message: `Claude Code not installed (no ${claudeHome}) — skipped`,
                fixCommand: null,
                details: null,
            }
        }

        const scriptExists = existsSync(
            join(claudeHome, STATUSLINE_SCRIPT_NAME)
        )
        const state = classifyStatuslineState(
            await readSettingsRaw(claudeHome),
            scriptExists
        )

        switch (state) {
            case 'registered':
                return {
                    name: CHECK_NAME,
                    status: 'pass',
                    message: 'luca statusline installed and registered',
                    fixCommand: null,
                    details: null,
                }
            case 'user-disabled':
                return {
                    name: CHECK_NAME,
                    status: 'pass',
                    message:
                        'statusline deliberately disabled (statusLine: null) — respected',
                    fixCommand: null,
                    details: null,
                }
            case 'user-custom':
                return {
                    name: CHECK_NAME,
                    status: 'pass',
                    message: 'custom user statusline present — preserved',
                    fixCommand: null,
                    details: scriptExists
                        ? null
                        : 'To opt in to the luca statusline, run `luca statusline install` and call the installed script from your own statusline command.',
                }
            case 'script-missing':
                return {
                    name: CHECK_NAME,
                    status: 'fail',
                    message: `statusLine registered but ${STATUSLINE_SCRIPT_NAME} is missing from ${claudeHome}`,
                    fixCommand: 'luca statusline install',
                    details:
                        'The registered command points at a script that no longer exists, so Claude Code renders no statusline.',
                }
            case 'unreadable-settings':
                return {
                    name: CHECK_NAME,
                    status: 'warning',
                    message: `could not parse ${join(claudeHome, 'settings.json')}`,
                    fixCommand: null,
                    details:
                        'Repair the file, then run `luca statusline install` to register the statusline.',
                }
            case 'not-registered':
                return {
                    name: CHECK_NAME,
                    status: 'warning',
                    message: 'luca statusline not registered',
                    fixCommand: 'luca statusline install',
                    details: scriptExists
                        ? 'The script is installed but settings.json has no statusLine entry (likely initialized by luca ≤13.0.1, which shipped the script without registering it).'
                        : 'Neither the statusline script nor a statusLine registration is present.',
                }
            // istanbul-style exhaustiveness: no-claude-home is handled
            // before classification; this satisfies the switch.
            case 'no-claude-home':
                return {
                    name: CHECK_NAME,
                    status: 'pass',
                    message: 'Claude Code not installed — skipped',
                    fixCommand: null,
                    details: null,
                }
        }
    },

    async fix(): Promise<DoctorFixResult> {
        const applied: string[] = []
        const errors: string[] = []

        // installStatusline reports outcomes only through its log sink;
        // translate its lines into the doctor fix contract.
        await installStatusline({
            home: defaultClaudeHome(),
            log: (msg) => {
                const line = msg.trim()
                if (line.startsWith('write:')) {
                    applied.push(line.replace(/^write:\s*/, 'wrote '))
                } else if (line.startsWith('skip:')) {
                    errors.push(line.replace(/^skip:\s*/, ''))
                }
            },
        })

        return { applied, errors }
    },
}
