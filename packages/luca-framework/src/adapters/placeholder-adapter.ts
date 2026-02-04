/**
 * Placeholder Work Tracker Adapter
 *
 * A no-op adapter that returns synthetic ticket data for projects
 * without work tracking integration. This is the fallback when:
 * - No Jira or GitHub Issues integration is configured
 * - User explicitly chooses 'none' for work tracking
 * - Quick work that doesn't need tracking (PT-0000)
 *
 * @module adapters/placeholder-adapter
 */

import type {
  WorkTrackerContract,
  WorkTicket,
  AdapterResult,
} from '../contracts/work-tracker'

/**
 * Configuration options for the placeholder adapter.
 */
export interface PlaceholderAdapterConfig {
  /** Default ticket ID when none provided (default: "PROJ-0000") */
  placeholderTicket?: string
}

/**
 * Create a placeholder work tracker adapter.
 *
 * This adapter never fails and always returns synthetic data.
 * Use it as the fallback for projects without work tracking.
 *
 * @param config - Optional configuration
 * @returns A WorkTrackerContract implementation that returns synthetic data
 *
 * @example
 * ```typescript
 * const adapter = createPlaceholderAdapter()
 * const result = await adapter.getTicket('TEST-123')
 * // result.data.id === 'TEST-123'
 * // result.data.title === 'Untracked work'
 * ```
 *
 * @example
 * ```typescript
 * // With custom default ticket
 * const adapter = createPlaceholderAdapter({ placeholderTicket: 'MYPROJ-0000' })
 * const result = await adapter.getTicket('')
 * // result.data.id === 'MYPROJ-0000'
 * ```
 */
export function createPlaceholderAdapter(
  config: PlaceholderAdapterConfig = {}
): WorkTrackerContract {
  const { placeholderTicket = 'PROJ-0000' } = config

  return {
    name: 'none' as const,

    async getTicket(ticketId: string): Promise<AdapterResult<WorkTicket>> {
      // Use provided ticketId, or fall back to configured placeholder
      const id = ticketId || placeholderTicket

      const ticket: WorkTicket = {
        id,
        title: 'Untracked work',
        description: 'This work is not linked to a tracking system.',
        type: 'task',
        status: 'In Progress',
        priority: 'medium',
        assignee: undefined,
        url: '',
      }

      return { success: true, data: ticket }
    },

    async validate(): Promise<AdapterResult<boolean>> {
      // Placeholder adapter is always valid - nothing to configure
      return { success: true, data: true }
    },
  }
}
