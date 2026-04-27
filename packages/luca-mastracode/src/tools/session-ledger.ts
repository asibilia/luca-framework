/**
 * session-ledger (tool) — Mastra tool wrapper exposing the session ledger
 * to agents. Data layer + schemas live in `../session-ledger.ts`.
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    readLedger,
    getLedgerByEvent,
    computeSessionMetrics,
    readRoutingHistory,
} from '../session-ledger.js'

export const sessionLedgerTool = createTool({
    id: 'session-ledger',
    description:
        'Read session ledger events and compute session metrics. Use this for finalization, process data analysis, and session summaries. Record entries at mode transitions and phase boundaries to maintain an accurate audit trail.',
    inputSchema: z.object({
        action: z
            .enum(['read', 'filter', 'metrics', 'routing-history'])
            .describe(
                'read: all events | filter: events by type | metrics: session summary | routing-history: model routing decisions'
            ),
        eventType: z
            .string()
            .optional()
            .describe('Event type to filter by (for filter action)'),
        limit: z
            .number()
            .optional()
            .describe(
                'Max entries to return (for routing-history, default 20)'
            ),
    }),
    execute: async (inputData) => {
        const { action, eventType, limit } = inputData

        switch (action) {
            case 'read': {
                const entries = readLedger()
                const returned = entries.slice(-50)
                return {
                    success: true,
                    message:
                        entries.length > returned.length
                            ? `Last ${returned.length} of ${entries.length} ledger entries`
                            : `${entries.length} ledger entries`,
                    entries: returned,
                }
            }
            case 'filter': {
                if (!eventType)
                    return {
                        success: false,
                        message: 'eventType required for filter',
                    }
                const entries = getLedgerByEvent(eventType)
                return {
                    success: true,
                    message: `${entries.length} entries for event "${eventType}"`,
                    entries,
                }
            }
            case 'metrics': {
                const metrics = computeSessionMetrics()
                return {
                    success: true,
                    message: `Session: ${metrics.totalEvents} events, ${metrics.modeTransitions} transitions, ${metrics.phasesCompleted} phases, ${metrics.totalIterations} iterations`,
                    metrics,
                }
            }
            case 'routing-history': {
                const history = readRoutingHistory({ limit: limit ?? 20 })
                return {
                    success: true,
                    message: `${history.length} routing decisions`,
                    history,
                }
            }
            default:
                return { success: false, message: `Unknown action: ${action}` }
        }
    },
})
