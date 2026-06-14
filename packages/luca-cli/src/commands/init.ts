/**
 * CLI command: luca init
 *
 * Bootstrap orchestrator. Runs a 5-step flow that's idempotent at every
 * step, so re-running is safe:
 *
 * 1. **Prerequisites** — Bun runtime check (global)
 * 2. **Luca home** — Ensure ~/.luca/ directory exists (global)
 * 3. **MuninnDB** — Binary download + service start (global)
 * 4. **Claude integration** — Install skills/commands/agents and register
 *    the stage-gate hook into the *global* ~/.claude/ scope (global)
 * 5. **Project skeleton** — Write the per-project .luca/ planning files
 *
 * Everything except Step 5 is global. A repo only ever receives `.luca/`
 * planning files — the Claude skill set and hook live in `~/.claude/` so a
 * single luca CLI version owns one canonical copy across every project.
 * Stray per-repo copies from older luca versions are cleaned up by
 * `luca doctor --fix`.
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
 * # Skip a specific harness (each flag governs ONLY that harness)
 * luca init --skip-claude
 * luca init --skip-antigravity
 *
 * # Skip the per-project .luca/ skeleton (only do global setup)
 * luca init --skip-project
 * ```
 */
import * as p from '@clack/prompts'
import { defineCommand, runMain } from 'citty'
import { join } from 'pathe'

import {
    HARNESSES,
    defaultAntigravityHome,
    defaultClaudeHome,
    installHooks,
    installSkills,
    writeProjectSkeleton,
} from '../init'
import { detectProjectContext } from '../utils/detect'
import { logger } from '../utils/logger'
import { ensureLucaHome } from '../utils/luca-home'
import { downloadMuninndbBinary } from '../utils/muninndb-download'
import { checkMuninndbBinary } from '../utils/muninndb-health'
import { startMuninndb } from '../utils/muninndb-service'
import { isOnPath, getPathGuidance } from '../utils/path-check'
import { checkPrerequisites, promptBunInstall } from '../utils/prerequisites'
import {
    suggestVaultName,
    autoCreateVault,
    writeVaultConfig,
} from '../utils/vault-setup'

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
        'skip-claude': {
            type: 'boolean',
            description:
                'Skip the global Claude harness integration (~/.claude/ hook + ~/.claude.json MCP). Does NOT affect Antigravity.',
            default: false,
        },
        'skip-antigravity': {
            type: 'boolean',
            description:
                'Skip the global Antigravity harness integration (~/.gemini/antigravity-cli/ hook + MCP).',
            default: false,
        },
        'skip-project': {
            type: 'boolean',
            description: 'Skip the per-project .luca/ skeleton',
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
            p.log.step('Step 1/5: Prerequisites')
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
            p.log.info('Step 1/5: Prerequisites (skipped)')
        }

        // ── Step 2: Luca home directory ──────────────────────────────────────
        p.log.step('Step 2/5: Luca home directory')
        const homePaths = await ensureLucaHome()
        p.log.success(`Luca home directory: ${homePaths.root}`)

        // ── Step 3: MuninnDB ─────────────────────────────────────────────────
        if (!args['skip-muninndb']) {
            p.log.step('Step 3/5: MuninnDB')
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
            p.log.info('Step 3/5: MuninnDB (skipped)')
        }

        // ── Step 4: Global Agent integration ────────────────────────────────
        const claudeHome = defaultClaudeHome()
        const agyHome = defaultAntigravityHome()
        let agentSetupRan = false

        // Per-harness skip flags (WS8): `--skip-claude` now governs ONLY the
        // Claude harness, `--skip-antigravity` ONLY Antigravity — neither
        // gates the whole step.
        const skipMap: Record<(typeof HARNESSES)[number]['id'], boolean> = {
            claude: args['skip-claude'],
            antigravity: args['skip-antigravity'],
        }

        // A harness is active when it is neither skipped nor uninstalled.
        // Gating on `isInstalled()` (home dir exists) is the WS8 behavior
        // change: init no longer pre-seeds a harness whose home doesn't exist
        // yet ("don't scaffold a harness the user doesn't have"), reversing the
        // old unconditional `mkdir -p`. (G-DX-005)
        const activeHarnesses = HARNESSES.filter(
            (h) => !skipMap[h.id] && h.isInstalled()
        )

        if (activeHarnesses.length > 0) {
            p.log.step(
                'Step 4/5: Agent integration (~/.claude/ + ~/.gemini/antigravity-cli/)'
            )
            // Artifact installs are now descriptor-driven and run per active
            // harness inside this loop. This completes WS8: skills/agents/
            // commands AND the statusline now respect the same
            // `!skipMap[h.id] && h.isInstalled()` gating as hooks/MCP — a
            // harness whose home is absent no longer receives any artifacts
            // (previously installSkills/installStatusline ran unconditionally
            // whenever ANY harness was active). For the default case (both
            // harnesses present) the SAME files land in the SAME homes:
            // Claude gets commands+agents+skills+statusline, Antigravity gets
            // agents+skills — exactly as `installArtifacts` encodes.
            for (const h of activeHarnesses) {
                await installSkills({
                    home: h.home(),
                    artifacts: h.installArtifacts,
                    log: (msg) => p.log.info(msg),
                })
                await h.wireHooks({ log: (msg) => p.log.info(msg) })
                if (h.mcp) await h.mcp.wire({ log: (msg) => p.log.info(msg) })
                await h.installExtras?.({ log: (msg) => p.log.info(msg) })
            }
            agentSetupRan = true
            p.log.success(
                `Agent integration installed (${activeHarnesses
                    .map((h) => h.displayName)
                    .join(', ')})`
            )
        } else {
            p.log.info('Step 4/5: Agent integration (skipped — no active harness)')
        }

        // ── Step 5: Per-project skeleton ─────────────────────────────────────
        let projectSetupRan = false
        let automatedVaultName = ''
        if (!args['skip-project']) {
            p.log.step('Step 5/5: Project skeleton (.luca/ + .claude/hooks/)')
            const projectCwd = process.cwd()
            await writeProjectSkeleton({
                cwd: projectCwd,
                log: (msg) => p.log.info(msg),
            })
            // B3: copy bundled Claude Code hook handlers + merge the
            // bundled settings.json into the project's .claude/
            // directory. Without this the compiled settings.json's
            // hook handler references resolve to nothing and the
            // pipeline-guard / continuation / context-refresher hooks
            // are dead on arrival.
            await installHooks({
                cwd: projectCwd,
                log: (msg) => p.log.info(msg),
            })

            if (muninndbHealthy) {
                const context = await detectProjectContext(projectCwd)
                automatedVaultName = suggestVaultName(context, projectCwd)
                await autoCreateVault(automatedVaultName)
                const configPath = join(projectCwd, '.luca', 'config.json')
                await writeVaultConfig(automatedVaultName, configPath)

                // Claude MCP is now registered globally via the Step-4
                // `h.mcp.wire` loop (wireClaudeMcp → ~/.claude.json file-merge),
                // not a per-project `claude mcp add` shell-out.
                p.log.success(
                    `MuninnDB vault "${automatedVaultName}" automatically created`
                )
            }

            projectSetupRan = true
            p.log.success(
                `Per-project skeleton written to ${projectCwd}/.luca/ + ${projectCwd}/.claude/`
            )
        } else {
            p.log.info('Step 5/5: Project skeleton (skipped)')
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
        if (agentSetupRan) {
            readout.push(
                `  ${claudeHome}/  (Claude skills, agents, hook — global)`
            )
            readout.push(
                `  ${agyHome}/  (Antigravity skills, agents, hook — global)`
            )
        }
        if (projectSetupRan) {
            readout.push(`  ${process.cwd()}/.luca/  (per-project planning)`)
        }

        readout.push('')
        readout.push('Next steps:')
        if (!automatedVaultName) {
            readout.push(
                '  To set up a project vault: cd <project> && luca vault:init'
            )
        }
        readout.push('  To start the pipeline:     lu "<your task>"')
        readout.push(
            '  To seed project conventions:        invoke /luca-init from Claude Code'
        )
        readout.push(
            '    (probes branching/commits/PR/release/tracker conventions and'
        )
        readout.push(
            '     stores them in MuninnDB; downstream pipeline modes consult them)'
        )

        if (!automatedVaultName) {
            // MuninnDB serves its MCP endpoint on its own fixed port (8750),
            // distinct from the service/dashboard port (8476). luca does not
            // manage the MCP port, so it is not derived from MUNINNDB_PORT.
            readout.push(
                '  To expose MuninnDB to Claude Code: register it as an MCP server,'
            )
            readout.push(
                `    e.g. claude mcp add --transport sse muninn http://localhost:8750/mcp \\`
            )
            readout.push(
                '         --header "Authorization: Bearer <your-muninn-api-key>"'
            )
            readout.push(
                '    (or add a "muninn" entry under mcpServers in .mcp.json). Use the'
            )
            readout.push(
                '    same key as `luca vault:init` (.env MUNINN_DB_API_KEY). See the'
            )
            readout.push('    README "MuninnDB" section for details.')
        }

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
