/**
 * Work Tracker Contract
 *
 * Defines the interface for pluggable work tracking systems.
 * Implementations can wrap Jira, GitHub Issues, or provide placeholder behavior.
 *
 * @module contracts/work-tracker
 */

/**
 * Ticket type classification matching common work tracking systems.
 */
export type WorkTicketType = 'bug' | 'story' | 'task' | 'epic' | 'subtask'

/**
 * Priority levels from highest to lowest urgency.
 */
export type WorkTicketPriority = 'highest' | 'high' | 'medium' | 'low' | 'lowest'

/**
 * Work ticket details returned from any tracker.
 *
 * This interface normalizes ticket data across different systems:
 * - Jira: Maps from issue fields (key, summary, description, issuetype, priority, status)
 * - GitHub: Maps from issue (number, title, body, labels, state)
 * - Placeholder: Returns synthetic data for untracked work
 */
export interface WorkTicket {
  /** Unique identifier (e.g., "PROJ-1234" for Jira, "#123" for GitHub) */
  id: string
  /** Ticket title/summary */
  title: string
  /** Detailed description (may contain markdown) */
  description: string
  /** Classification of work type */
  type: WorkTicketType
  /** Current workflow status (e.g., "In Progress", "open") */
  status: string
  /** Urgency level */
  priority: WorkTicketPriority
  /** Assigned user (optional - may not be set) */
  assignee?: string
  /** URL to view the ticket in the source system (empty for placeholder) */
  url: string
}

/**
 * Discriminated union for adapter operation results.
 *
 * All adapter methods return this type to provide consistent error handling:
 * - Success: `{ success: true, data: T }`
 * - Failure: `{ success: false, error: string }`
 *
 * @example
 * ```typescript
 * const result = await adapter.getTicket('PROJ-123')
 * if (result.success) {
 *   console.log(result.data.title)
 * } else {
 *   console.error(result.error)
 * }
 * ```
 */
export type AdapterResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Supported adapter types for work tracking.
 */
export type WorkTrackerType = 'jira' | 'github' | 'none'

/**
 * Contract interface for work tracking adapters.
 *
 * Adapters implement this interface to provide integration with work tracking systems.
 * Only `getTicket` is required - other methods are optional capabilities.
 *
 * ## Required vs Optional Methods
 *
 * - **Required**: `name`, `getTicket()` - Core identification and ticket retrieval
 * - **Optional**: `createBranch()`, `linkPR()`, `validate()` - Extended capabilities
 *
 * ## Error Handling
 *
 * Adapters should return `{ success: false, error: string }` for:
 * - Missing configuration (API keys, base URLs)
 * - Network failures
 * - Invalid ticket IDs
 * - Authentication errors
 *
 * ## Implementation Notes
 *
 * - Adapters should be stateless (configuration passed at construction)
 * - All async methods should handle timeouts gracefully
 * - Optional methods should NOT be implemented if not supported
 *   (let the caller check with `if (adapter.createBranch)`)
 */
export interface WorkTrackerContract {
  /**
   * Identifier for this adapter type.
   * Used for logging and configuration validation.
   */
  readonly name: WorkTrackerType

  /**
   * Retrieve ticket details by ID.
   *
   * REQUIRED - All adapters must implement this method.
   *
   * @param ticketId - The ticket identifier (e.g., "PROJ-123", "#456")
   * @returns Ticket details or error message
   *
   * @example
   * ```typescript
   * const result = await adapter.getTicket('PROJ-123')
   * if (result.success) {
   *   console.log(`Working on: ${result.data.title}`)
   * }
   * ```
   */
  getTicket(ticketId: string): Promise<AdapterResult<WorkTicket>>

  /**
   * Create a feature branch linked to the ticket.
   *
   * OPTIONAL - Only implement if the adapter can create branches.
   *
   * @param ticketId - The ticket to link the branch to
   * @param branchName - The branch name to create
   * @returns The created branch name or error
   */
  createBranch?(ticketId: string, branchName: string): Promise<AdapterResult<string>>

  /**
   * Link a pull request to the ticket.
   *
   * OPTIONAL - Only implement if the adapter supports PR linking.
   *
   * @param ticketId - The ticket to link the PR to
   * @param prUrl - The URL of the pull request
   * @returns Success/failure result
   */
  linkPR?(ticketId: string, prUrl: string): Promise<AdapterResult<void>>

  /**
   * Validate adapter configuration.
   *
   * OPTIONAL - Implement to allow users to verify their setup.
   * Should check API connectivity, authentication, permissions.
   *
   * @returns `true` if configuration is valid, error message if not
   */
  validate?(): Promise<AdapterResult<boolean>>
}
