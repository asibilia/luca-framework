/**
 * repo-cleanup — Mastra tool that scans and cleans up AI-session debris.
 *
 * Orchestrates the shadow-scanner subagent. Five actions:
 *   • scan              — prepare scan parameters and config summary
 *   • parse-report      — validate scanner output → cleanup-report.ts
 *   • apply-fix         — apply remediation → cleanup-fixes.ts
 *   • summary           — surface current shadow-debt config
 *   • cleanup-artifacts — remove intermediate capture/convergence files
 */
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { applyDelete, applyGitignore, applyMove } from './cleanup-fixes.js'
import { parseShadowScanReport } from './cleanup-report.js'

import {
    determineScanMode,
    loadShadowDebtConfig,
    SCAN_MODE_CATEGORIES,
    type ScanMode,
} from '../state/shadow-scanner.js'

export const repoCleanupTool = createTool({
    id: 'repo-cleanup',
    description:
        'Scan and clean up AI-session debris in the repository. ' +
        'Orchestrates the shadow-scanner subagent: prepares scan parameters, ' +
        'parses scanner output, applies fixes, and reports summaries. ' +
        'Run during finalization before PR creation — not during execution.',
    inputSchema: z.object({
        action: z
            .enum([
                'scan',
                'parse-report',
                'apply-fix',
                'summary',
                'cleanup-artifacts',
            ])
            .describe('Operation to perform'),
        scan_mode: z
            .enum(['quick', 'standard', 'full'])
            .optional()
            .describe(
                'Explicit scan mode (for scan action). Auto-determined if omitted.'
            ),
        raw_output: z
            .string()
            .optional()
            .describe(
                'Raw shadow-scanner subagent output (for parse-report action)'
            ),
        file_path: z
            .string()
            .optional()
            .describe('File path to apply fix to (for apply-fix action)'),
        recommended_action: z
            .enum(['move', 'delete', 'gitignore'])
            .optional()
            .describe('Fix action to apply (for apply-fix action)'),
        target_path: z
            .string()
            .optional()
            .describe(
                'Destination path for move action (for apply-fix action)'
            ),
    }),
    execute: async (input) => {
        const {
            action,
            scan_mode,
            raw_output,
            file_path,
            recommended_action,
            target_path,
        } = input

        switch (action) {
            case 'scan': {
                const config = loadShadowDebtConfig()
                if (!config.enabled) {
                    return {
                        status: 'disabled',
                        message:
                            'Shadow debt scanning is disabled in .planning/config.json',
                    }
                }

                const mode: ScanMode = scan_mode ?? determineScanMode({})
                const categories = SCAN_MODE_CATEGORIES[mode]

                return {
                    status: 'ready',
                    scan_mode: mode,
                    categories_to_scan: categories,
                    config_summary: {
                        denylist_patterns: config.denylist_patterns,
                        known_good_script_dirs: config.known_good_script_dirs,
                        known_artifact_dirs: config.known_artifact_dirs,
                        allowlist: config.allowlist,
                        planning_root_allowlist: config.planning_root_allowlist,
                        planning_root_dirs: config.planning_root_dirs,
                        planning_root_versioned_patterns:
                            config.planning_root_versioned_patterns,
                        repo_root_markdown_allowlist:
                            config.repo_root_markdown_allowlist,
                    },
                    instructions:
                        `Spawn the shadow-scanner subagent with task: ` +
                        `"Run a ${mode} shadow scan (categories ${categories.join(', ')}). ` +
                        `Use the shadow_debt config from .planning/config.json."`,
                }
            }

            case 'parse-report': {
                if (!raw_output) {
                    return { error: 'raw_output is required for parse-report' }
                }
                return parseShadowScanReport(raw_output)
            }

            case 'apply-fix': {
                if (!file_path || !recommended_action) {
                    return {
                        error: 'file_path and recommended_action are required for apply-fix',
                    }
                }

                switch (recommended_action) {
                    case 'delete':
                        return applyDelete(file_path)
                    case 'move':
                        return applyMove(file_path, target_path)
                    case 'gitignore':
                        return applyGitignore(file_path)
                    default:
                        return {
                            error: `Unknown action: ${recommended_action}`,
                        }
                }
            }

            case 'summary': {
                const config = loadShadowDebtConfig()
                return {
                    enabled: config.enabled,
                    phase_scan_mode: config.phase_scan_mode,
                    milestone_scan_mode: config.milestone_scan_mode,
                    block_milestone_on_critical:
                        config.block_milestone_on_critical,
                    denylist_patterns: config.denylist_patterns,
                    allowlist: config.allowlist,
                }
            }

            case 'cleanup-artifacts': {
                const planningDir = join(process.cwd(), '.planning')
                const removed: string[] = []

                if (existsSync(planningDir)) {
                    // Remove intermediate capture files (*-capture-*.md)
                    for (const file of readdirSync(planningDir)) {
                        if (/-capture-/.test(file) && file.endsWith('.md')) {
                            unlinkSync(join(planningDir, file))
                            removed.push(file)
                        }
                    }

                    // Remove convergence tracking file
                    const convergenceFile = join(
                        planningDir,
                        'checks-convergence.json'
                    )
                    if (existsSync(convergenceFile)) {
                        unlinkSync(convergenceFile)
                        removed.push('checks-convergence.json')
                    }
                }

                return {
                    status: removed.length > 0 ? 'cleaned' : 'nothing-to-clean',
                    removed,
                    message:
                        removed.length > 0
                            ? `Removed ${removed.length} artifact(s): ${removed.join(', ')}`
                            : 'No capture artifacts found in .planning/',
                }
            }

            default:
                return { error: `Unknown action: ${action}` }
        }
    },
})
