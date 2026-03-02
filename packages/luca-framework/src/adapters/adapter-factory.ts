/**
 * Work Tracker Adapter Factory
 *
 * Factory function for creating work tracker adapters based on type.
 * Adapters provide normalized access to work tracking systems.
 *
 * @module adapters
 */

import type {
  WorkTrackerContract,
  WorkTrackerType,
} from "../contracts/work-tracker";
import { createGitHubAdapter } from "./github-adapter";
import { createJiraAdapter } from "./jira-adapter";
import { createPlaceholderAdapter } from "./placeholder-adapter";

/**
 * Configuration passed to adapter constructors.
 * Each adapter type may require different configuration.
 */
export interface WorkTrackerConfig {
  /** Default ticket for placeholder adapter */
  placeholderTicket?: string;
  /** Jira base URL (for jira adapter) */
  jiraBaseUrl?: string;
  /** Jira API token (for jira adapter) */
  jiraApiToken?: string;
  /** Jira user email (for jira adapter) */
  jiraUserEmail?: string;
  /** GitHub repository owner (for github adapter) */
  githubOwner?: string;
  /** GitHub repository name (for github adapter) */
  githubRepo?: string;
}

/**
 * Create a work tracker adapter of the specified type.
 *
 * Factory function that returns the appropriate adapter implementation:
 * - `'none'`: Placeholder adapter (synthetic data, never fails)
 * - `'github'`: GitHub Issues adapter (via gh CLI)
 * - `'jira'`: Jira REST API adapter (via REST API v3)
 *
 * @param type - The type of work tracker to create
 * @param config - Configuration options (varies by adapter type)
 * @returns A WorkTrackerContract implementation
 *
 * @example
 * ```typescript
 * // Create placeholder adapter (always works)
 * const adapter = createWorkTrackerAdapter('none')
 * const result = await adapter.getTicket('TEST-123')
 *
 * // Create GitHub adapter (requires gh CLI)
 * const github = createWorkTrackerAdapter('github')
 * const issue = await github.getTicket('#123')
 *
 * // Create Jira adapter (requires JIRA_* env vars)
 * const jira = createWorkTrackerAdapter('jira')
 * const ticket = await jira.getTicket('PROJ-123')
 * ```
 */
export function createWorkTrackerAdapter(
  type: WorkTrackerType,
  config: WorkTrackerConfig = {},
): WorkTrackerContract {
  switch (type) {
    case "jira":
      return createJiraAdapter({
        baseUrl: config.jiraBaseUrl,
        userEmail: config.jiraUserEmail,
        apiToken: config.jiraApiToken,
      });

    case "github":
      return createGitHubAdapter({
        owner: config.githubOwner,
        repo: config.githubRepo,
      });

    case "none":
    default:
      return createPlaceholderAdapter({
        placeholderTicket: config.placeholderTicket,
      });
  }
}
