/**
 * Work Tracker Adapter Factory
 *
 * Factory function for creating work tracker adapters based on type.
 * Adapters provide normalized access to work tracking systems.
 *
 * @module adapters
 */

import type { WorkTrackerContract, WorkTrackerType } from '../contracts/work-tracker'
import { createPlaceholderAdapter } from './placeholder-adapter'

/**
 * Configuration passed to adapter constructors.
 * Each adapter type may require different configuration.
 */
export interface WorkTrackerConfig {
  /** Default ticket for placeholder adapter */
  placeholderTicket?: string
  /** Jira base URL (for jira adapter) */
  jiraBaseUrl?: string
  /** Jira API token (for jira adapter) */
  jiraApiToken?: string
  /** Jira user email (for jira adapter) */
  jiraUserEmail?: string
  /** GitHub repository owner (for github adapter) */
  githubOwner?: string
  /** GitHub repository name (for github adapter) */
  githubRepo?: string
}

/**
 * Create a work tracker adapter of the specified type.
 *
 * Factory function that returns the appropriate adapter implementation:
 * - `'none'`: Placeholder adapter (synthetic data, never fails)
 * - `'github'`: GitHub Issues adapter (via gh CLI) - NOT YET IMPLEMENTED
 * - `'jira'`: Jira REST API adapter - NOT YET IMPLEMENTED
 *
 * @param type - The type of work tracker to create
 * @param config - Configuration options (varies by adapter type)
 * @returns A WorkTrackerContract implementation
 *
 * @throws {Error} When requesting an unimplemented adapter type
 *
 * @example
 * ```typescript
 * // Create placeholder adapter (always works)
 * const adapter = createWorkTrackerAdapter('none')
 * const result = await adapter.getTicket('TEST-123')
 *
 * // Will throw until implemented
 * const jira = createWorkTrackerAdapter('jira', {
 *   jiraBaseUrl: 'https://company.atlassian.net',
 *   jiraApiToken: 'token',
 *   jiraUserEmail: 'user@company.com'
 * })
 * ```
 */
export function createWorkTrackerAdapter(
  type: WorkTrackerType,
  config: WorkTrackerConfig = {}
): WorkTrackerContract {
  switch (type) {
    case 'jira':
      // Will be implemented in 02-03
      throw new Error('Jira adapter not yet implemented')

    case 'github':
      // Will be implemented in 02-02
      throw new Error('GitHub adapter not yet implemented')

    case 'none':
    default:
      return createPlaceholderAdapter({
        placeholderTicket: config.placeholderTicket,
      })
  }
}

// Re-export types for convenience
export type { WorkTrackerContract, WorkTrackerType } from '../contracts/work-tracker'
export type { WorkTicket, AdapterResult } from '../contracts/work-tracker'
export { createPlaceholderAdapter } from './placeholder-adapter'
