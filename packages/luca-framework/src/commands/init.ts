/**
 * CLI command: luca init
 *
 * Bootstrap orchestrator. Runs a 4-step flow that's idempotent at every
 * step, so re-running in the same project is safe:
 *
 * 1. **Prerequisites** — Bun runtime check (global)
 * 2. **Luca home** — Ensure ~/.luca/ directory exists (global)
 * 3. **MuninnDB** — Binary download + service start (global)
 * 4. **Project skeleton** — Write .luca/ + .claude/ stage-gate wiring (per-project)
 *
 * Per-project vault wiring (vault name + API key) is handled
 * separately by `luca vault:init`.
 *
 * @example
 * ```bash
 * # Full interactive setup
 * luca init
 *
 * # Skip prerequisite checks
 * luca init --skip-prerequisites
 *
 * # Skip MuninnDB setup (manage it separately)
 * luca init --skip-muninndb
 *
 * # Skip per-project skeleton (only do global setup)
 * luca init --skip-project
 * ```
 */
import * as p from '@clack/prompts'
import { defineCommand, runMain } from 'citty'

import {
    installSkills,
    wireClaudeHooks,
    wireMcpServer,
    writeProjectSkeleton,
} from '../init'
import { logger } from '../utils/logger'
import { ensureLucaHome } from '../utils/luca-home'
import { downloadMuninndbBinary } from '../utils/muninndb-download'
import { checkMuninndbBinary } from '../utils/muninndb-health'
import { startMuninndb } from '../utils/muninndb-service'
import { isOnPath, getPathGuidance } from '../utils/path-check'
import { checkPrerequisites, promptBunInstall } from '../utils/prerequisites'

// ─── Init command definition ─────────────────────────────────────────────────

export const initCommand = defineCommand({
    meta: {
        name: 'init',
        description: 'Bootstrap MuninnDB and set up the Luca home directory',
    },
    args: {
        'skip-prerequisites': {
            type: 'boolean',
            description: 'Skip prerequisite checks',
            default: false,
        },
        'skip-muninndb': {
            type: 'boolean',
            description: 'Skip MuninnDB binary download and service setup',
            default: false,
        },
        'skip-project': {
            type: 'boolean',
            description:
                'Skip per-project setup (.luca/ skeleton + .claude/ stage-gate hook)',
            default: false,
        },
    },
    async run({ args }) {
        p.intro('luca init')

        // Track status for post-init readout
        let prereqsVersion: string | null = null
        let prereqsPlatform = ''
        let muninndbHealthy = false
        let muninndbPort: number | null = null
        let muninndbBinaryPath: string | null = null

        // ── Step 1: Prerequisites ────────────────────────────────────────────
        if (!args['skip-prerequisites']) {
            p.log.step('Step 1/3: Prerequisites')
            const prereqs = checkPrerequisites()

            if (!prereqs.ok) {
                const shouldContinue = await promptBunInstall()
                if (!shouldContinue) {
                    p.outro(
                        'Setup cancelled. Install Bun and run `luca init` again.'
                    )
                    process.exit(1)
                }

                const recheck = checkPrerequisites()
                if (!recheck.ok) {
                    logger.error(
                        'Bun still not detected. Please install Bun and try again.'
                    )
                    process.exit(1)
                }
            }

            prereqsVersion = prereqs.bun.version ?? 'detected'
            prereqsPlatform = `${prereqs.platform.os}/${prereqs.platform.arch}`
            p.log.success(`Bun ${prereqsVersion} (${prereqsPlatform})`)
        } else {
            p.log.info('Step 1/3: Prerequisites (skipped)')
        }

        // ── Step 2: Luca home directory ──────────────────────────────────────
        p.log.step('Step 2/3: Luca home directory')
        const homePaths = await ensureLucaHome()
        p.log.success(`Luca home directory: ${homePaths.root}`)

        // ── Step 3: MuninnDB ─────────────────────────────────────────────────
        if (!args['skip-muninndb']) {
            p.log.step('Step 3/3: MuninnDB')
            const binaryStatus = await checkMuninndbBinary()

            if (!binaryStatus.installed) {
                p.log.info('MuninnDB not found. Downloading...')
                const installResult = await downloadMuninndbBinary()

                if (!installResult.success) {
                    p.log.warn(
                        `MuninnDB download failed: ${installResult.error ?? 'unknown error'}`
                    )
                    p.log.warn(
                        'You can install MuninnDB later or run `luca init` again.'
                    )
                } else {
                    muninndbBinaryPath = installResult.binaryPath
                    p.log.success(
                        `MuninnDB binary installed: ${installResult.binaryPath}`
                    )
                }
            } else {
                muninndbBinaryPath = binaryStatus.path
                p.log.success(
                    `MuninnDB binary found: ${binaryStatus.path}${binaryStatus.version ? ` (${binaryStatus.version})` : ''}`
                )
            }

            // Start service if binary is available
            const recheckBinary = await checkMuninndbBinary()
            if (recheckBinary.installed && recheckBinary.executable) {
                p.log.info('Starting MuninnDB service...')
                const serviceStatus = await startMuninndb()

                if (serviceStatus.healthy) {
                    muninndbHealthy = true
                    muninndbPort = serviceStatus.port
                    p.log.success(
                        `MuninnDB running on port ${serviceStatus.port}${serviceStatus.pid ? ` (PID ${serviceStatus.pid})` : ''}`
                    )
                } else {
                    p.log.warn(
                        'MuninnDB started but health check failed. It may need a moment to initialize.'
                    )
                    p.log.info('Check status with: luca doctor')
                }
            }

            // PATH guidance
            if (!isOnPath(homePaths.bin)) {
                const guidance = getPathGuidance(homePaths.bin)
                p.note(
                    [
                        `${homePaths.bin} is not on your PATH.`,
                        'Add it so the MuninnDB binary is available globally:',
                        '',
                        guidance,
                    ].join('\n'),
                    'PATH Setup Required'
                )
            }
        } else {
            p.log.info('Step 3/3: MuninnDB (skipped)')
        }

        // ── Step 4: Per-project skeleton ─────────────────────────────────────
        let projectSetupRan = false
        if (!args['skip-project']) {
            p.log.step('Step 4/4: Project skeleton (.luca/ + .claude/)')
            const projectCwd = process.cwd()
            await writeProjectSkeleton({
                cwd: projectCwd,
                log: (msg) => p.log.info(msg),
            })
            await wireClaudeHooks({
                cwd: projectCwd,
                log: (msg) => p.log.info(msg),
            })
            await wireMcpServer({
                cwd: projectCwd,
                log: (msg) => p.log.info(msg),
            })
            await installSkills({
                cwd: projectCwd,
                log: (msg) => p.log.info(msg),
            })
            projectSetupRan = true
            p.log.success(`Per-project skeleton written to ${projectCwd}`)
        } else {
            p.log.info('Step 4/4: Project skeleton (skipped)')
        }

        // ── Post-init readout ────────────────────────────────────────────────
        const readout: string[] = []

        readout.push('Prerequisites:')
        if (prereqsVersion) {
            readout.push(`  Bun ${prereqsVersion} (${prereqsPlatform})`)
        } else {
            readout.push('  Skipped')
        }

        readout.push('')
        readout.push('MuninnDB:')
        if (args['skip-muninndb']) {
            readout.push('  Skipped')
        } else if (muninndbHealthy) {
            readout.push(`  Running on port ${muninndbPort}`)
            if (muninndbBinaryPath) {
                readout.push(`  Binary: ${muninndbBinaryPath}`)
            }
        } else {
            readout.push(
                '  Not running (start with `muninn start` or re-run `luca init`)'
            )
        }

        readout.push('')
        readout.push('Directories:')
        readout.push(`  ${homePaths.root}/`)
        readout.push(`  ${homePaths.bin}/`)
        if (projectSetupRan) {
            readout.push(`  ${process.cwd()}/.luca/`)
            readout.push(`  ${process.cwd()}/.claude/`)
        }

        readout.push('')
        readout.push('Next steps:')
        readout.push(
            '  To set up a project vault: cd <project> && luca vault:init'
        )
        readout.push('  To launch the harness:     luca run')
        readout.push(
            '  To seed project conventions:        invoke /luca-init inside `luca run`'
        )
        readout.push(
            '    (probes branching/commits/PR/release/tracker conventions and'
        )
        readout.push(
            '     stores them in MuninnDB; downstream pipeline modes consult them)'
        )
        readout.push(
            '  To expose MuninnDB to the harness: add an MCP server entry to'
        )
        readout.push(
            '    <home>/.mastracode/mcp.json (macOS/Linux: ~/.mastracode/mcp.json;'
        )
        readout.push(
            '    Windows: %USERPROFILE%\\.mastracode\\mcp.json) — see README →'
        )
        readout.push('    "Wiring MuninnDB into the Mastracode harness".')

        p.note(readout.join('\n'), 'Setup Complete')

        p.outro('Luca is ready. Happy building!')
    },
})

/**
 * Run init command directly (used by create-luca and bin/luca.js).
 *
 * Preserves the export contract consumed by index.ts and downstream consumers.
 */
export const runInit = () => runMain(initCommand)
