/**
 * CLI command: luca migrate-planning
 *
 * Moves canonical root-level state from the legacy `.planning/` directory
 * into the new `.luca/` directory contract, deletes ephemeral files, and
 * preserves git history via `git mv`. Idempotent — safe to re-run.
 *
 * Phase directories (`.planning/phases/`) and unmapped artifacts are
 * intentionally left in place by this initial migration. Follow-up
 * commands will handle phase normalization once the slug-collision
 * strategy is decided.
 *
 * @example
 * ```bash
 * # See the plan without touching anything
 * luca migrate-planning --dry-run
 *
 * # Actually move the files
 * luca migrate-planning
 *
 * # Proceed even when .planning/ has uncommitted changes
 * luca migrate-planning --force
 * ```
 */
import { defineCommand } from 'citty'

import { migratePlanningHandler } from '../migration/helpers/migrate-planning-handler.ts'

export const migratePlanningCommand = defineCommand({
    meta: {
        name: 'migrate-planning',
        description:
            'Migrate .planning/ root files to the new .luca/ directory contract',
    },
    args: {
        'dry-run': {
            type: 'boolean',
            description:
                'Print the migration plan without moving anything',
            default: false,
        },
        force: {
            type: 'boolean',
            description:
                'Proceed even when .planning/ has uncommitted changes',
            default: false,
        },
    },
    async run({ args }) {
        await migratePlanningHandler({
            cwd: process.cwd(),
            dryRun: args['dry-run'],
            force: args.force,
            log: (msg) => {
                console.log(msg)
            },
        })
    },
})
