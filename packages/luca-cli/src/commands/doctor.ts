/**
 * CLI command: luca doctor
 *
 * Run environment diagnostics: Bun runtime and MuninnDB health.
 *
 * @example
 * ```bash
 * # Run all checks
 * luca doctor
 *
 * # Run with verbose output
 * luca doctor --verbose
 *
 * # Run only prerequisite checks
 * luca doctor --scope=prerequisites
 *
 * # Apply automatic fixes (e.g. remove stray local installs)
 * luca doctor --fix
 * ```
 */
import { defineCommand } from 'citty'

import { executeDoctor } from '../utils/doctor'
import type { DoctorScope } from '../utils/doctor/types'

/** Valid scope values for the --scope argument. */
const VALID_SCOPES: DoctorScope[] = ['prerequisites', 'global', 'project']

export default defineCommand({
    meta: {
        name: 'doctor',
        description: 'Run environment diagnostics and health checks',
    },
    args: {
        verbose: {
            type: 'boolean',
            description: 'Show detailed check information',
            alias: 'v',
            default: false,
        },
        scope: {
            type: 'string',
            description:
                'Filter checks by scope: prerequisites, global, or project',
            alias: 's',
        },
        fix: {
            type: 'boolean',
            description:
                'Apply automatic fixes for issues that support remediation (e.g. stray local installs)',
            default: false,
        },
    },
    async run({ args }) {
        // Validate scope if provided
        const scope = args.scope as DoctorScope | undefined
        if (scope && !VALID_SCOPES.includes(scope)) {
            console.error(
                `Invalid --scope value: "${scope}". Valid options: ${VALID_SCOPES.join(', ')}`
            )
            process.exit(1)
        }

        const exitCode = await executeDoctor({
            verbose: args.verbose,
            scope,
            fix: args.fix,
        })
        process.exit(exitCode)
    },
})
