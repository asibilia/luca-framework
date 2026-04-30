/**
 * run-postmortem (tool) — Mastra tool wrapper for the postmortem analyzer.
 *
 * Three actions:
 *   - analyze: return the structured PostmortemReport.
 *   - render:  write `.planning/POSTMORTEM.md` and return the path + violation count.
 *   - gate:    same as analyze, but returns success=false with code POSTMORTEM_VIOLATIONS
 *              if any critical violations exist. Used by finalize as the last
 *              gate before PR creation.
 *
 * The tool returns a `pitfalls` array of pre-formatted MuninnDB payloads
 * (default vault, type=pitfall) that the calling agent should forward via
 * `mcp__muninn__muninn_remember` so future runs can recall recurring failures.
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    analyzeRun,
    writePostmortem,
    listRuns,
} from '../postmortem.js'
import { listArchivedRuns } from '../session-ledger.js'

export const runPostmortemTool = createTool({
    id: 'run-postmortem',
    description:
        'Analyze a Luca pipeline run for silent skips, unverified todo completions, and other gaps. ' +
        "Use 'gate' as the last call in finalize before PR creation — critical violations block the PR. " +
        "Use 'render' to write a human-readable .planning/POSTMORTEM.md report. " +
        "Use 'analyze' for read-only inspection. " +
        "Use 'list-runs' to enumerate archived runs in the ledger. " +
        'The tool returns a `pitfalls` array of pre-formatted MuninnDB payloads (default vault) — forward each via mcp__muninn__muninn_remember.',
    inputSchema: z.object({
        action: z
            .enum(['analyze', 'render', 'gate', 'list-runs'])
            .describe(
                'analyze: structured report | render: write .planning/POSTMORTEM.md | gate: block on critical violations | list-runs: enumerate archived runs'
            ),
        runId: z
            .string()
            .optional()
            .describe(
                'Optional run ID to analyze. Defaults to the current run.'
            ),
    }),
    execute: async (inputData) => {
        const { action, runId } = inputData

        switch (action) {
            case 'analyze': {
                const report = analyzeRun(runId)
                return {
                    success: true,
                    message: `Run ${report.runId}: ${report.violations.length} violation(s) (${report.violations.filter((v) => v.severity === 'critical').length} critical)`,
                    report,
                    pitfalls: report.pitfalls,
                }
            }
            case 'render': {
                const report = analyzeRun(runId)
                const { path, bytes } = writePostmortem(report)
                return {
                    success: true,
                    message: `Wrote ${path} (${bytes} bytes). ${report.violations.length} violation(s).`,
                    path,
                    violationCount: report.violations.length,
                    pitfalls: report.pitfalls,
                }
            }
            case 'gate': {
                const report = analyzeRun(runId)
                const critical = report.violations.filter(
                    (v) => v.severity === 'critical'
                )
                if (critical.length > 0) {
                    return {
                        success: false,
                        code: 'POSTMORTEM_VIOLATIONS',
                        message: `Postmortem gate failed: ${critical.length} critical violation(s). Re-enter pipeline at execute or review and resolve before finalizing.`,
                        violations: report.violations,
                        pitfalls: report.pitfalls,
                    }
                }
                return {
                    success: true,
                    message: `Postmortem gate passed. ${report.violations.length} warning(s) (no criticals).`,
                    violations: report.violations,
                    pitfalls: report.pitfalls,
                }
            }
            case 'list-runs': {
                const liveRuns = listRuns()
                const liveIds = new Set(liveRuns.map((r) => r.runId))
                const archivedOnly = listArchivedRuns()
                    .filter((id) => !liveIds.has(id))
                    .map((runId) => ({
                        runId,
                        firstEvent: '',
                        lastEvent: '',
                        eventCount: 0,
                        archived: true as const,
                    }))
                const live = liveRuns.map((r) => ({
                    ...r,
                    archived: false as const,
                }))
                const runs = [...live, ...archivedOnly]
                return {
                    success: true,
                    message: `${runs.length} run(s) (live: ${live.length}, archived-only: ${archivedOnly.length})`,
                    runs,
                }
            }
            default:
                return {
                    success: false,
                    message: `Unknown action: ${String(action)}`,
                }
        }
    },
})
