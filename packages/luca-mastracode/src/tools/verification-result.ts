import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    readVerificationResult,
    writeVerificationResult,
    readVerificationHistory,
    aggregateVerificationResults,
} from '../verification-result.js'

const criterionSchema = z.object({
    criterionId: z.string().describe('Stable identifier (e.g. "ac-01")'),
    description: z.string().describe('Human-readable description'),
    met: z.boolean().describe('Whether the criterion is satisfied'),
    evidence: z.string().describe('File/line/test evidence'),
    gap: z.string().optional().describe('What is missing if not met'),
    blocking: z.boolean().describe('Whether this blocks proceeding'),
})

const checkResultSchema = z.object({
    name: z.string(),
    status: z.enum(['pass', 'fail', 'skip', 'timeout']),
    errorCount: z.number(),
    warningCount: z.number(),
    durationMs: z.number().optional(),
})

export const verificationResultTool = createTool({
    id: 'verification-result',
    description:
        'Read or write structured verification results (JSON). Replaces prose-based verification with deterministic output for orchestrator consumption. Always write results after verification — never skip this step.',
    inputSchema: z.object({
        action: z
            .enum(['write', 'read', 'read-history', 'aggregate'])
            .describe(
                'write: save a new result | read: get latest | read-history: get all | aggregate: milestone summary'
            ),
        result: z
            .object({
                phase: z.string().optional(),
                wave: z.number(),
                mode: z.enum(['quick', 'full']),
                status: z.enum(['PASS', 'FAIL', 'STALLED']),
                criteria: z.array(criterionSchema),
                checks: z.array(checkResultSchema),
                convergence: z.enum(['converging', 'stalled', 'resolved']),
                errorFingerprints: z.array(z.string()),
                recommendation: z.enum(['proceed', 'fix', 'escalate']),
                notes: z.string().optional(),
            })
            .optional()
            .describe(
                'Verification result to write (required for write action)'
            ),
    }),
    execute: async (inputData) => {
        const { action, result } = inputData

        switch (action) {
            case 'write': {
                if (!result) {
                    return {
                        success: false,
                        message: 'result is required for write action',
                    }
                }
                writeVerificationResult({
                    ...result,
                    timestamp: new Date().toISOString(),
                })
                return {
                    success: true,
                    message: `Verification result written (wave ${result.wave}, status: ${result.status})`,
                    result: result as unknown as Record<string, unknown>,
                }
            }
            case 'read': {
                const latest = readVerificationResult()
                if (!latest) {
                    return {
                        success: false,
                        message: 'No verification result found',
                    }
                }
                return {
                    success: true,
                    message: `Latest result: wave ${latest.wave}, status ${latest.status}`,
                    result: latest as unknown as Record<string, unknown>,
                }
            }
            case 'read-history': {
                const history = readVerificationHistory()
                return {
                    success: true,
                    message: `${history.length} verification results in history`,
                    history: history as unknown as Array<
                        Record<string, unknown>
                    >,
                }
            }
            case 'aggregate': {
                const all = readVerificationHistory()
                if (all.length === 0) {
                    return {
                        success: false,
                        message: 'No verification history to aggregate',
                    }
                }
                const summary = aggregateVerificationResults(all)
                return {
                    success: true,
                    message: `Aggregated ${summary.totalWaves} waves: ${summary.passCount} pass, ${summary.failCount} fail, ${summary.stalledCount} stalled`,
                    aggregate: summary as unknown as Record<string, unknown>,
                }
            }
            default:
                return { success: false, message: `Unknown action: ${action}` }
        }
    },
})
