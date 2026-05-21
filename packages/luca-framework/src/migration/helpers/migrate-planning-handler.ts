import { runMigration, type MigrationOptions } from './run-migration.ts'

export interface MigratePlanningHandlerOptions extends MigrationOptions {
    log?: (msg: string) => void
}

/**
 * Run the migration and emit human-readable progress through `log`.
 *
 * Pure-ish wrapper over runMigration that the citty CLI command delegates
 * to. Pulling the logging into a separate function keeps the CLI command
 * file thin and lets tests assert on log output without spawning a
 * subprocess.
 */
export async function migratePlanningHandler(
    opts: MigratePlanningHandlerOptions
): Promise<void> {
    const log = opts.log ?? (() => {})

    const { plan } = await runMigration(opts)

    if (plan.moves.length === 0 && plan.deletes.length === 0) {
        log('Nothing to migrate.')
        return
    }

    log(opts.dryRun ? '== Migration plan (dry-run) ==' : '== Migrating ==')
    for (const move of plan.moves) {
        log(`  move:   ${move.from} → ${move.to}`)
    }
    for (const del of plan.deletes) {
        log(`  delete: ${del}`)
    }
}
