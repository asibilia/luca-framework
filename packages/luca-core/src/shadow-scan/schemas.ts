/**
 * Shadow-scan report schema.
 *
 * The luca-shadow-scanner subagent scans the repository for AI-session
 * debris and emits a JSON ShadowScanReport as the last block of its
 * response. This schema is the canonical contract for that output —
 * luca_repo_cleanup_apply validates an individual finding against
 * ShadowScanFindingSchema before applying any remediation.
 *
 * API-shaped (data crosses the agent boundary), so field names are
 * snake_case per the project's api-snake-case convention.
 */
import { z } from 'zod'

export const ShadowScanSeverity = z.enum([
    'critical',
    'high',
    'medium',
    'low',
])
export type ShadowScanSeverity = z.infer<typeof ShadowScanSeverity>

export const ShadowScanAction = z.enum(['delete', 'move', 'gitignore'])
export type ShadowScanAction = z.infer<typeof ShadowScanAction>

export const ShadowScanMode = z.enum(['quick', 'standard', 'full'])
export type ShadowScanMode = z.infer<typeof ShadowScanMode>

export const ShadowScanFindingSchema = z.object({
    /** Detection category label, e.g. "orphaned-temp-script". */
    category: z.string().min(1),
    severity: ShadowScanSeverity,
    /** Repo-relative path of the flagged file. */
    file_path: z.string().min(1),
    /** What was detected. */
    description: z.string().min(1),
    /** Human-readable remediation recommendation. */
    recommendation: z.string().min(1),
    /** The remediation the apply tool would perform. */
    recommended_action: ShadowScanAction,
    /** Destination path — required for a `move` action. */
    target_path: z.string().min(1).optional(),
    /** Whether the remediation is safe to apply without user confirmation. */
    auto_fixable: z.boolean(),
})
export type ShadowScanFinding = z.infer<typeof ShadowScanFindingSchema>

export const ShadowScanSummarySchema = z.object({
    total: z.number().int().min(0),
    critical: z.number().int().min(0),
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
})
export type ShadowScanSummary = z.infer<typeof ShadowScanSummarySchema>

export const ShadowScanReportSchema = z.object({
    scan_mode: ShadowScanMode,
    /** Detection category numbers that were run for this scan. */
    categories_scanned: z.array(z.number().int()),
    findings: z.array(ShadowScanFindingSchema),
    summary: ShadowScanSummarySchema,
    scanned_at: z
        .string()
        .datetime({ message: 'scanned_at must be ISO 8601 datetime' }),
})
export type ShadowScanReport = z.infer<typeof ShadowScanReportSchema>
