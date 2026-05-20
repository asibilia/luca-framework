/**
 * CLI entry point for the Luca framework.
 *
 * Defines the main CLI command with sub-commands for init, vault:init,
 * run, doctor, and version. Separated from index.ts to keep the barrel
 * pure (re-exports only).
 */

import { defineCommand, runMain as cittyRunMain } from 'citty'

import { LUCA_VERSION } from './utils/manifest'

const main = defineCommand({
    meta: {
        name: 'luca',
        version: LUCA_VERSION,
        description:
            'Luca CLI — bootstrap MuninnDB and launch the Mastra Code harness',
    },
    subCommands: {
        init: () => import('./commands/init').then((m) => m.initCommand),
        'vault:init': () =>
            import('./commands/vault-init').then((m) => m.vaultInitCommand),
        run: () => import('./commands/run').then((m) => m.runCommand),
        retro: () => import('./commands/retro').then((m) => m.retroCommand),
        doctor: () => import('./commands/doctor').then((m) => m.default),
        hook: () => import('./commands/hook').then((m) => m.hookCommand),
        mcp: () => import('./commands/mcp').then((m) => m.mcpCommand),
        'migrate-planning': () =>
            import('./commands/migrate-planning').then(
                (m) => m.migratePlanningCommand,
            ),
        repair: () =>
            import('./commands/repair').then((m) => m.repairCommand),
        version: () =>
            import('./commands/version').then((m) => m.versionCommand),
    },
})

export const runMain = () => cittyRunMain(main)

export const runInit = () => import('./commands/init').then((m) => m.runInit())
