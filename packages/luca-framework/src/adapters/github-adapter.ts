/**
 * GitHub Issues Work Tracker Adapter
 *
 * Adapter for GitHub Issues using the gh CLI for issue retrieval and branch creation.
 * This provides a simpler integration compared to Jira, validating the adapter pattern
 * before tackling more complex REST APIs.
 *
 * @module adapters/github-adapter
 */

import { execa } from "execa";
import { z } from "zod";

import type {
  WorkTrackerContract,
  WorkTicket,
  WorkTicketType,
  WorkTicketPriority,
  AdapterResult,
} from "../contracts/work-tracker";

/**
 * Configuration options for the GitHub adapter.
 */
export interface GitHubAdapterConfig {
  /** GitHub repository owner (auto-detected from git remote if not provided) */
  owner?: string;
  /** GitHub repository name (auto-detected from git remote if not provided) */
  repo?: string;
}

/**
 * Zod schema for validating GitHub Issue response from gh CLI --json output.
 *
 * Ensures the response structure matches what we expect before processing,
 * preventing issues from malformed or unexpected API responses.
 */
const githubIssueResponseSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  labels: z
    .array(z.object({ name: z.string() }))
    .optional()
    .default([]),
  assignees: z
    .array(z.object({ login: z.string() }))
    .optional()
    .default([]),
  url: z.string().optional(),
});

/**
 * GitHub Issue response shape derived from Zod schema.
 */
type GitHubIssueResponse = z.infer<typeof githubIssueResponseSchema>;

/**
 * Match GitHub labels to a value using a mapping table.
 *
 * Iterates through mappings in order, returning the value for the first
 * label match found. Falls back to the default if no match.
 *
 * @param labels - Array of label objects from GitHub
 * @param mappings - Ordered array of [labelNames[], value] pairs
 * @param defaultValue - Fallback when no labels match
 * @returns The matched value or default
 */
function mapLabels<T>(
  labels: Array<{ name: string }>,
  mappings: Array<[string[], T]>,
  defaultValue: T,
): T {
  const labelNames = labels.map((l) => l.name.toLowerCase());
  for (const [keys, value] of mappings) {
    if (keys.some((k) => labelNames.includes(k))) return value;
  }
  return defaultValue;
}

/** Label-to-type mappings for GitHub issues. */
const TYPE_MAPPINGS: Array<[string[], WorkTicketType]> = [
  [["bug"], "bug"],
  [["enhancement", "feature"], "story"],
  [["epic"], "epic"],
];

/** Label-to-priority mappings for GitHub issues. */
const PRIORITY_MAPPINGS: Array<[string[], WorkTicketPriority]> = [
  [["critical", "urgent"], "highest"],
  [["high", "priority"], "high"],
  [["low"], "low"],
];

function inferTypeFromLabels(labels: Array<{ name: string }>): WorkTicketType {
  return mapLabels(labels, TYPE_MAPPINGS, "task");
}

function inferPriorityFromLabels(
  labels: Array<{ name: string }>,
): WorkTicketPriority {
  return mapLabels(labels, PRIORITY_MAPPINGS, "medium");
}

/**
 * Parse error output to provide helpful error messages.
 *
 * @param error - Error from execa
 * @param issueNumber - The issue number being looked up
 * @returns Formatted error message
 */
function parseGhError(error: unknown, issueNumber: string): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Check for common error patterns
  if (
    lowerMessage.includes("not found") ||
    lowerMessage.includes("could not resolve")
  ) {
    return `Issue #${issueNumber} not found`;
  }

  if (
    lowerMessage.includes("command not found") ||
    lowerMessage.includes("enoent")
  ) {
    return "GitHub CLI (gh) not installed. Run: brew install gh";
  }

  if (
    lowerMessage.includes("not logged in") ||
    lowerMessage.includes("authentication")
  ) {
    return "GitHub CLI not authenticated. Run: gh auth login";
  }

  // Sanitize token/bearer patterns before returning error to prevent credential leaks
  const sanitized = errorMessage.replace(
    /(?:token|bearer|ghp_|gho_|github_pat_)\s*\S+/gi,
    "[REDACTED]",
  );

  // Return the sanitized error if no pattern matched
  return `GitHub CLI error: ${sanitized}`;
}

/**
 * Validate a git branch name against git's naming rules.
 *
 * Rejects patterns that could cause shell injection or are invalid per git-check-ref-format:
 * - Empty/blank names
 * - Names starting with '-' (interpreted as flags)
 * - Names containing '..' (traversal)
 * - Names with whitespace, NUL, ~, ^, :, or backslash
 * - Names ending with '.lock' or '.'
 * - Names containing '//'
 *
 * @param name - Branch name to validate
 * @returns Validation result with optional error message
 */
function validateBranchName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim() === "")
    return { valid: false, error: "Branch name is required" };
  if (name.startsWith("-"))
    return { valid: false, error: "Branch name cannot start with -" };
  if (name.includes(".."))
    return { valid: false, error: "Branch name cannot contain .." };
  if (/[\s\0~^:\\]/.test(name))
    return { valid: false, error: "Branch name contains invalid characters" };
  if (name.endsWith(".lock"))
    return { valid: false, error: "Branch name cannot end with .lock" };
  if (name.endsWith("."))
    return { valid: false, error: "Branch name cannot end with ." };
  if (name.includes("//"))
    return { valid: false, error: "Branch name cannot contain //" };
  return { valid: true };
}

/**
 * Validate that an issue number is a positive numeric string.
 *
 * Prevents injection of flags or special characters into gh CLI commands.
 *
 * @param num - Issue number string to validate
 * @returns Validation result with optional error message
 */
function validateIssueNumber(num: string): { valid: boolean; error?: string } {
  if (!/^\d+$/.test(num))
    return { valid: false, error: "Issue number must be numeric" };
  return { valid: true };
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
  config: GitHubAdapterConfig = {},
): WorkTrackerContract {
  // Config is available for future use (explicit owner/repo override)
  const _config = config;

  return {
    name: "github" as const,

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
      const issueNumber = ticketId.replace(/^#/, "");

      // Validate issue number is numeric to prevent injection
      const issueValidation = validateIssueNumber(issueNumber);
      if (!issueValidation.valid) {
        return { success: false, error: issueValidation.error! };
      }

      try {
        const { stdout } = await execa("gh", [
          "issue",
          "view",
          "--json",
          "number,title,body,state,labels,assignees,url",
          "--",
          issueNumber,
        ]);

        const raw = JSON.parse(stdout);
        const parsed = githubIssueResponseSchema.safeParse(raw);

        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid GitHub API response: ${parsed.error.message}`,
          };
        }

        const issue = parsed.data;

        const ticket: WorkTicket = {
          id: `#${issue.number}`,
          title: issue.title,
          description: issue.body || "",
          type: inferTypeFromLabels(issue.labels),
          status: issue.state,
          priority: inferPriorityFromLabels(issue.labels),
          assignee: issue.assignees?.[0]?.login,
          url: issue.url ?? "",
        };

        return { success: true, data: ticket };
      } catch (error) {
        return { success: false, error: parseGhError(error, issueNumber) };
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
      branchName: string,
    ): Promise<AdapterResult<string>> {
      const issueNumber = ticketId.replace(/^#/, "");

      // Validate inputs to prevent injection
      const issueValidation = validateIssueNumber(issueNumber);
      if (!issueValidation.valid) {
        return { success: false, error: issueValidation.error! };
      }

      const branchValidation = validateBranchName(branchName);
      if (!branchValidation.valid) {
        return { success: false, error: branchValidation.error! };
      }

      try {
        // Try gh issue develop first (creates linked branch)
        await execa("gh", [
          "issue",
          "develop",
          issueNumber,
          "--name",
          branchName,
        ]);
        return { success: true, data: branchName };
      } catch {
        // Fallback to standard git checkout with -- to separate flags from branch name
        try {
          await execa("git", ["checkout", "-b", "--", branchName]);
          return { success: true, data: branchName };
        } catch (gitError) {
          const errorMessage =
            gitError instanceof Error ? gitError.message : String(gitError);
          return {
            success: false,
            error: `Failed to create branch: ${errorMessage}`,
          };
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
      _prUrl: string,
    ): Promise<AdapterResult<void>> {
      // GitHub auto-links via "Closes #123" in PR body - no action needed
      return { success: true, data: undefined };
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
        const { stdout } = await execa("gh", ["auth", "status"]);

        // Check if output indicates logged in status
        if (
          stdout.toLowerCase().includes("logged in") ||
          stdout.toLowerCase().includes("active account: true")
        ) {
          return { success: true, data: true };
        }

        return {
          success: false,
          error: "GitHub CLI not authenticated. Run: gh auth login",
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (
          errorMessage.toLowerCase().includes("command not found") ||
          errorMessage.toLowerCase().includes("enoent")
        ) {
          return {
            success: false,
            error: "GitHub CLI (gh) not installed. Run: brew install gh",
          };
        }

        return {
          success: false,
          error: `GitHub CLI validation failed: ${errorMessage}`,
        };
      }
    },
  };
}
