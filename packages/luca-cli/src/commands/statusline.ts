/**
 * CLI command: luca statusline
 *
 * Manage the luca Claude Code statusline outside of `luca init`.
 *
 * `luca init` installs the statusline as part of Step 4, but only when
 * the Claude harness is active — and versions ≤13.0.1 shipped the
 * bundled script without ever registering it. This command gives those
 * machines (and anyone who skipped/undid the init step) a direct path.
 *
 * @example
 * ```bash
 * # Install the bundled script into ~/.claude/ and register it in
 * # ~/.claude/settings.json (idempotent; user statuslines preserved)
 * luca statusline install
 *
 * # Install into a non-default Claude home
 * luca statusline install --home /custom/claude/home
 * ```
 */
import { defineCommand } from 'citty'

import { defaultClaudeHome, installStatusline } from '../init'
import { logger } from '../utils/logger'

const installSubcommand = defineCommand({
    meta: {
        name: 'install',
        description:
            'Install the luca statusline script into ~/.claude/ and register it in settings.json',
    },
    args: {
        home: {
            type: 'string',
            description:
                'Claude home directory to install into (default: ~/.claude)',
        },
    },
    async run({ args }) {
        const home = args.home || defaultClaudeHome()
        logger.info(`Installing luca statusline into ${home}`)

        let failed = false
        await installStatusline({
            home,
            log: (msg) => {
                const line = msg.trim()
                if (line.startsWith('skip:')) {
                    failed = true
                    logger.warn(line)
                } else {
                    logger.success(line)
                }
            },
        })

        if (failed) {
            // A skip is actionable (kept-user, unparsable settings, or a
            // missing bundle) — exit non-zero so scripts can detect it,
            // with the skip line above explaining what to do.
            process.exit(1)
        }
        logger.success(
            'Statusline installed — restart Claude Code to see it.'
        )
    },
})

export const statuslineCommand = defineCommand({
    meta: {
        name: 'statusline',
        description: 'Manage the luca Claude Code statusline',
    },
    subCommands: {
        install: installSubcommand,
    },
})
