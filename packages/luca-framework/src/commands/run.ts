/**
 * CLI command: luca run
 *
 * Launches the luca-mastracode harness — the custom Mastra Code distribution
 * that is the core of the Luca framework. Resolves the harness entrypoint
 * from the monorepo workspace when running in-repo, or from the mastracode
 * tree bundled inside the installed `@alecsibilia/luca-framework` tarball
 * otherwise, and spawns it with passthrough args.
 *
 * Shows a passive update notification (24h cache) before launch.
 *
 * @example
 * ```bash
 * luca run                     # Launch harness with defaults
 * luca run --dry-run           # Show what would be launched without running
 * ```
 */
import { existsSync } from 'node:fs'

import { defineCommand } from 'citty'
import { join } from 'pathe'

import { logger } from '../utils/logger'
import { LUCA_VERSION } from '../utils/manifest'
import {
    detectRuntimeContext,
    resolveFrameworkPackageRoot,
    resolveMonorepoRoot,
} from '../utils/runtime-context'
import { checkForUpdates } from '../utils/version-check'

/**
 * Resolve the path to the luca-mastracode harness entrypoint.
 *
 * The same harness is loaded regardless of install shape — only the source
 * of truth differs:
 *
 *   • In-repo (workspace): `packages/luca-mastracode/src/index.ts`
 *   • Installed tarball:   `<luca-framework>/dist/mastracode/src/index.ts`
 *     (populated at framework build time from the workspace package)
 */
function resolveHarnessPath(): { command: string; args: string[] } | null {
    const ctx = detectRuntimeContext()

    if (ctx.mode === 'dev') {
        const monorepoRoot = resolveMonorepoRoot(ctx.packageDir)
        const devEntry = join(
            monorepoRoot,
            'packages/luca-mastracode/src/index.ts'
        )

        if (existsSync(devEntry)) {
            return { command: 'bun', args: ['run', devEntry] }
        }
    }

    // Installed mode: the harness is bundled inside the framework's tarball.
    const frameworkRoot = resolveFrameworkPackageRoot(ctx.packageDir)
    if (frameworkRoot) {
        const bundledEntry = join(frameworkRoot, 'dist/mastracode/src/index.ts')
        if (existsSync(bundledEntry)) {
            return { command: 'bun', args: ['run', bundledEntry] }
        }
    }

    return null
}

export const runCommand = defineCommand({
    meta: {
        name: 'run',
        description: 'Launch the Luca Mastra Code harness',
    },
    args: {
        'dry-run': {
            type: 'boolean',
            default: false,
            description:
                'Show the resolved harness command without launching it',
        },
    },
    async run({ args }) {
        // Passive update notification — fire-and-forget so harness launch is never delayed
        void checkForUpdates().catch(() => {})

        const resolved = resolveHarnessPath()

        if (!resolved) {
            logger.error(
                'Could not locate the bundled luca-mastracode harness.\n' +
                    '  • In monorepo dev mode: ensure packages/luca-mastracode/ exists\n' +
                    '  • As installed package: the harness should be bundled at\n' +
                    '    <install>/dist/mastracode/src/index.ts. Try reinstalling\n' +
                    '    @alecsibilia/luca-framework.'
            )
            process.exit(1)
        }

        const fullArgs = [...resolved.args]

        if (args['dry-run']) {
            logger.info(`Would run: ${resolved.command} ${fullArgs.join(' ')}`)
            return
        }

        logger.info('Launching Luca Mastra Code harness...')

        const proc = Bun.spawn([resolved.command, ...fullArgs], {
            stdio: ['inherit', 'inherit', 'inherit'],
            env: { ...process.env, LUCA_VERSION },
        })

        const exitCode = await proc.exited
        process.exit(exitCode)
    },
})
