/**
 * GitHub Issues Work Tracker Adapter
 *
 * Adapter for GitHub Issues using the gh CLI for issue retrieval and branch creation.
 * This provides a simpler integration compared to Jira, validating the adapter pattern
 * before tackling more complex REST APIs.
 *
 * @module adapters/github-adapter
 */

import { execa } from 'execa'

import type {
  WorkTrackerContract,
  WorkTicket,
  WorkTicketType,
  WorkTicketPriority,
  AdapterResult,
} from '../contracts/work-tracker'

/**
 * Configuration options for the GitHub adapter.
 */
export interface GitHubAdapterConfig {
  /** GitHub repository owner (auto-detected from git remote if not provided) */
  owner?: string
  /** GitHub repository name (auto-detected from git remote if not provided) */
  repo?: string
}

/**
 * GitHub Issue response shape from gh CLI --json output.
 */
interface GitHubIssueResponse {
  number: number
  title: string
  body: string | null
  state: string
  labels: Array<{ name: string }>
  assignees: Array<{ login: string }>
  url: string
}

/**
 * Infer WorkTicket type from GitHub issue labels.
 *
 * Maps common GitHub labels to normalized ticket types:
 * - 'bug' → bug
 * - 'enhancement' or 'feature' → story
 * - 'epic' → epic
 * - Default → task
 *
 * @param labels - Array of label objects from GitHub
 * @returns Normalized ticket type
 */
function inferTypeFromLabels(labels: Array<{ name: string }>): WorkTicketType {
  const labelNames = labels.map((l) => l.name.toLowerCase())
  if (labelNames.includes('bug')) return 'bug'
  if (labelNames.includes('enhancement') || labelNames.includes('feature'))
    return 'story'
  if (labelNames.includes('epic')) return 'epic'
  return 'task'
}

/**
 * Infer WorkTicket priority from GitHub issue labels.
 *
 * Maps common priority labels to normalized priority levels:
 * - 'critical' or 'urgent' → highest
 * - 'high' or 'priority' → high
 * - 'low' → low
 * - Default → medium
 *
 * @param labels - Array of label objects from GitHub
 * @returns Normalized priority level
 */
function inferPriorityFromLabels(
  labels: Array<{ name: string }>
): WorkTicketPriority {
  const labelNames = labels.map((l) => l.name.toLowerCase())
  if (labelNames.includes('critical') || labelNames.includes('urgent'))
    return 'highest'
  if (labelNames.includes('high') || labelNames.includes('priority'))
    return 'high'
  if (labelNames.includes('low')) return 'low'
  return 'medium'
}

/**
 * Parse error output to provide helpful error messages.
 *
 * @param error - Error from execa
 * @param issueNumber - The issue number being looked up
 * @returns Formatted error message
 */
function parseGhError(error: unknown, issueNumber: string): string {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const lowerMessage = errorMessage.toLowerCase()

  // Check for common error patterns
  if (
    lowerMessage.includes('not found') ||
    lowerMessage.includes('could not resolve')
  ) {
    return `Issue #${issueNumber} not found`
  }

  if (
    lowerMessage.includes('command not found') ||
    lowerMessage.includes('enoent')
  ) {
    return 'GitHub CLI (gh) not installed. Run: brew install gh'
  }

  if (
    lowerMessage.includes('not logged in') ||
    lowerMessage.includes('authentication')
  ) {
    return 'GitHub CLI not authenticated. Run: gh auth login'
  }

  // Return the original error if no pattern matched
  return `GitHub CLI error: ${errorMessage}`
}

/**
 * Create a GitHub Issues work tracker adapter.
 *
 * This adapter uses the gh CLI for all GitHub API interactions, which handles
 * authentication and provides reliable JSON output. The gh CLI must be installed
 * and authenticated before using this adapter.
 *
 * @param config - Optional configuration (owner/repo auto-detected if not provided)
 * @returns A WorkTrackerContract implementation for GitHub Issues
 *
 * @example
 * ```typescript
 * const adapter = createGitHubAdapter()
 *
 * // Validate gh CLI is ready
 * const valid = await adapter.validate?.()
 * if (!valid?.success) {
 *   console.error('Run: gh auth login')
 * }
 *
 * // Fetch issue details
 * const result = await adapter.getTicket('#123')
 * if (result.success) {
 *   console.log(result.data.title)
 * }
 * ```
 */
export function createGitHubAdapter(
  config: GitHubAdapterConfig = {}
): WorkTrackerContract {
  // Config is available for future use (explicit owner/repo override)
  const _config = config

  return {
    name: 'github' as const,

    /**
     * Retrieve GitHub issue details by number.
     *
     * Uses `gh issue view` to fetch issue data as JSON. The ticketId can be
     * provided with or without the '#' prefix (e.g., "123" or "#123").
     *
     * @param ticketId - Issue number (with or without # prefix)
     * @returns Issue details mapped to WorkTicket or error
     */
    async getTicket(ticketId: string): Promise<AdapterResult<WorkTicket>> {
      // Extract issue number (remove # prefix if present)
      const issueNumber = ticketId.replace(/^#/, '')

      try {
        const { stdout } = await execa('gh', [
          'issue',
          'view',
          issueNumber,
          '--json',
          'number,title,body,state,labels,assignees,url',
        ])

        const issue: GitHubIssueResponse = JSON.parse(stdout)

        const ticket: WorkTicket = {
          id: `#${issue.number}`,
          title: issue.title,
          description: issue.body || '',
          type: inferTypeFromLabels(issue.labels),
          status: issue.state,
          priority: inferPriorityFromLabels(issue.labels),
          assignee: issue.assignees?.[0]?.login,
          url: issue.url,
        }

        return { success: true, data: ticket }
      } catch (error) {
        return { success: false, error: parseGhError(error, issueNumber) }
      }
    },

    /**
     * Create a feature branch linked to the issue.
     *
     * Attempts to use `gh issue develop` first (creates branch and links to issue).
     * Falls back to standard `git checkout -b` if gh issue develop fails.
     *
     * @param ticketId - Issue number to link
     * @param branchName - Name for the new branch
     * @returns Created branch name or error
     */
    async createBranch(
      ticketId: string,
      branchName: string
    ): Promise<AdapterResult<string>> {
      const issueNumber = ticketId.replace(/^#/, '')

      try {
        // Try gh issue develop first (creates linked branch)
        await execa('gh', ['issue', 'develop', issueNumber, '--name', branchName])
        return { success: true, data: branchName }
      } catch {
        // Fallback to standard git checkout
        try {
          await execa('git', ['checkout', '-b', branchName])
          return { success: true, data: branchName }
        } catch (gitError) {
          const errorMessage =
            gitError instanceof Error ? gitError.message : String(gitError)
          return { success: false, error: `Failed to create branch: ${errorMessage}` }
        }
      }
    },

    /**
     * Link a pull request to the issue.
     *
     * GitHub auto-links PRs via "Closes #123" in the PR body, so this is a no-op.
     * The linking happens automatically when the PR is created with the appropriate
     * keywords in the description.
     *
     * @param _ticketId - Issue number (unused)
     * @param _prUrl - PR URL (unused)
     * @returns Success (always)
     */
    async linkPR(
      _ticketId: string,
      _prUrl: string
    ): Promise<AdapterResult<void>> {
      // GitHub auto-links via "Closes #123" in PR body - no action needed
      return { success: true, data: undefined }
    },

    /**
     * Validate that gh CLI is installed and authenticated.
     *
     * Runs `gh auth status` to check if the CLI is ready for use.
     *
     * @returns true if gh CLI is authenticated, error message if not
     */
    async validate(): Promise<AdapterResult<boolean>> {
      try {
        const { stdout } = await execa('gh', ['auth', 'status'])

        // Check if output indicates logged in status
        if (
          stdout.toLowerCase().includes('logged in') ||
          stdout.toLowerCase().includes('active account: true')
        ) {
          return { success: true, data: true }
        }

        return {
          success: false,
          error: 'GitHub CLI not authenticated. Run: gh auth login',
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)

        if (
          errorMessage.toLowerCase().includes('command not found') ||
          errorMessage.toLowerCase().includes('enoent')
        ) {
          return {
            success: false,
            error: 'GitHub CLI (gh) not installed. Run: brew install gh',
          }
        }

        return {
          success: false,
          error: `GitHub CLI validation failed: ${errorMessage}`,
        }
      }
    },
  }
}
