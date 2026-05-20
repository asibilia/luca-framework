/**
 * CLI command: luca repair
 *
 * Inspect the project's `.luca/` directory for recoverable issues:
 * - Clears stale locks (PID no longer running).
 * - Reports `state.json` schema validation errors without auto-fixing.
 *
 * The MCP server (Phase 4) directs users here when it detects corruption
 * on startup. Designed to be safe to run at any time.
 *
 * @example
 * ```bash
 * luca repair
 * ```
 */
import { defineCommand } from 'citty'

import { runRepair } from '../repair'

export const repairCommand = defineCommand({
    meta: {
        name: 'repair',
        description:
            'Diagnose and recover the project .luca/ directory (clears stale locks, validates state)',
    },
    async run() {
        const cwd = process.cwd()
        const result = await runRepair({
            cwd,
            log: (msg) => {
                console.log(`  ${msg}`)
            },
        })

        if (result.actions.length === 0 && result.errors.length === 0) {
            console.log('Nothing to repair.')
            return
        }

        if (result.actions.length > 0) {
            console.log('\n== Actions taken ==')
            for (const action of result.actions) {
                console.log(`  ${action}`)
            }
        }

        if (result.errors.length > 0) {
            console.log('\n== Errors (not auto-fixed) ==')
            for (const err of result.errors) {
                console.log(`  ${err}`)
            }
            process.exit(1)
        }
    },
})
