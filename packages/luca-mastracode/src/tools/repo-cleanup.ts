import {
    existsSync,
    readFileSync,
    readdirSync,
    unlinkSync,
    renameSync,
    appendFileSync,
    mkdirSync,
} from 'node:fs'
import { join, dirname } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    loadShadowDebtConfig,
    determineScanMode,
    ShadowScanReportSchema,
    SCAN_MODE_CATEGORIES,
    type ScanMode,
} from '../shadow-scanner.js'

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

                // Extract JSON block from the scanner output
                // Try fenced ```json block first, then raw JSON object
                let jsonStr: string | undefined
                const jsonMatch = raw_output.match(
                    /```json\s*\n([\s\S]*?)\n\s*```/
                )
                if (jsonMatch?.[1]) {
                    jsonStr = jsonMatch[1]
                } else {
                    // Try to find a raw JSON object with scan_mode key
                    const rawMatch = raw_output.match(
                        /(\{[\s\S]*"scan_mode"[\s\S]*\})\s*$/
                    )
                    if (rawMatch?.[1]) {
                        jsonStr = rawMatch[1]
                    }
                }

                if (!jsonStr) {
                    return {
                        error: 'No JSON block found in scanner output',
                        hint: 'The shadow-scanner subagent should emit a ```json block at the end of its response, or the raw_output should contain a JSON object with a scan_mode key.',
                    }
                }

                let parsed
                try {
                    parsed = JSON.parse(jsonStr)
                } catch (e) {
                    return {
                        error: 'Failed to parse JSON from scanner output',
                        detail: String(e),
                    }
                }

                const result = ShadowScanReportSchema.safeParse(parsed)
                if (!result.success) {
                    return {
                        error: 'Scanner output does not match ShadowScanReport schema',
                        issues: result.error.issues.map(
                            (i) => `${i.path.join('.')}: ${i.message}`
                        ),
                    }
                }

                const report = result.data
                const { summary } = report

                const banner = [
                    `Shadow Scan Complete — ${report.scan_mode} mode`,
                    `Categories scanned: ${report.categories_scanned.join(', ')}`,
                    ``,
                    `  Total:    ${summary.total}`,
                    `  Critical: ${summary.critical}`,
                    `  High:     ${summary.high}`,
                    `  Medium:   ${summary.medium}`,
                    `  Low:      ${summary.low}`,
                ].join('\n')

                return {
                    report,
                    banner,
                    has_critical: summary.critical > 0,
                    has_actionable: summary.total > 0,
                }
            }

            case 'apply-fix': {
                if (!file_path || !recommended_action) {
                    return {
                        error: 'file_path and recommended_action are required for apply-fix',
                    }
                }

                const fullPath = join(process.cwd(), file_path)

                switch (recommended_action) {
                    case 'delete': {
                        if (!existsSync(fullPath)) {
                            return {
                                status: 'skipped',
                                message: `File not found: ${file_path}`,
                            }
                        }
                        unlinkSync(fullPath)
                        return {
                            status: 'applied',
                            action: 'delete',
                            file_path,
                        }
                    }

                    case 'move': {
                        if (!target_path) {
                            return {
                                error: 'target_path is required for move action',
                            }
                        }
                        if (!existsSync(fullPath)) {
                            return {
                                status: 'skipped',
                                message: `File not found: ${file_path}`,
                            }
                        }
                        const fullTarget = join(process.cwd(), target_path)
                        mkdirSync(dirname(fullTarget), { recursive: true })
                        renameSync(fullPath, fullTarget)
                        return {
                            status: 'applied',
                            action: 'move',
                            file_path,
                            target_path,
                        }
                    }

                    case 'gitignore': {
                        const gitignorePath = join(process.cwd(), '.gitignore')
                        const entry = file_path.endsWith('/')
                            ? file_path
                            : `${file_path}\n`
                        const existing = existsSync(gitignorePath)
                            ? readFileSync(gitignorePath, 'utf-8')
                            : ''
                        if (existing.includes(file_path)) {
                            return {
                                status: 'skipped',
                                message: `Already in .gitignore: ${file_path}`,
                            }
                        }
                        const newline = existing.endsWith('\n') ? '' : '\n'
                        appendFileSync(gitignorePath, `${newline}${entry}`)
                        return {
                            status: 'applied',
                            action: 'gitignore',
                            file_path,
                        }
                    }

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
