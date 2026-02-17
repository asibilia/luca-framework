/**
 * Jira REST API Work Tracker Adapter
 *
 * Adapter for Jira using REST API v3 for ticket retrieval.
 * Provides integration for enterprise users who track work in Atlassian.
 * Works in CLI context (outside Cursor) and as fallback when MCP unavailable.
 *
 * @module adapters/jira-adapter
 */

import { z } from "zod";
import type {
  WorkTrackerContract,
  WorkTicket,
  WorkTicketType,
  WorkTicketPriority,
  AdapterResult,
} from "../contracts/work-tracker";

// ---------------------------------------------------------------------------
// Zod schemas for environment variable format validation
// ---------------------------------------------------------------------------

/** Validates that the base URL is a well-formed HTTPS URL */
const jiraBaseUrlSchema = z
  .string()
  .url("JIRA_BASE_URL must be a valid URL")
  .refine((url) => url.startsWith("https://"), {
    message: "JIRA_BASE_URL must use HTTPS",
  });

/** Validates that the user email is a valid email address */
const jiraEmailSchema = z
  .string()
  .email("JIRA_USER_EMAIL must be a valid email address");

/** Validates that the API token is a non-empty string */
const jiraTokenSchema = z.string().min(1, "JIRA_API_TOKEN must not be empty");

/** Pattern for valid Jira issue keys (e.g., PROJ-123) */
const JIRA_TICKET_ID_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;

/**
 * Configuration options for the Jira adapter.
 */
export interface JiraAdapterConfig {
  /** Jira base URL (defaults to JIRA_BASE_URL env var) */
  baseUrl?: string;
  /** Atlassian account email (defaults to JIRA_USER_EMAIL env var) */
  userEmail?: string;
  /** API token from Atlassian security settings (defaults to JIRA_API_TOKEN env var) */
  apiToken?: string;
}

/** Runtime validation schema for Jira REST API issue response */
const jiraIssueResponseSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    description: z.unknown(),
    issuetype: z.object({ name: z.string() }).optional(),
    priority: z.object({ name: z.string() }).optional(),
    status: z.object({ name: z.string() }).optional(),
    assignee: z.object({ displayName: z.string() }).optional(),
  }),
});

/**
 * Jira Issue response shape derived from Zod schema.
 */
type JiraIssueResponse = z.infer<typeof jiraIssueResponseSchema>;

/**
 * Sanitize error messages to prevent credential leakage.
 * Strips Authorization header values, Base64 strings, and API tokens.
 */
function sanitizeJiraError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Basic\s+[A-Za-z0-9+/=]+/g, "Basic [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, "[REDACTED]")
    .replace(/token[=:]\s*\S+/gi, "token=[REDACTED]");
}

/**
 * Map Jira issue type to normalized WorkTicket type.
 *
 * @param type - Jira issue type name
 * @returns Normalized ticket type
 */
function mapJiraType(type: string | undefined): WorkTicketType {
  if (!type) return "task";

  const typeMap: Record<string, WorkTicketType> = {
    Bug: "bug",
    Story: "story",
    Task: "task",
    Epic: "epic",
    "Sub-task": "subtask",
  };
  return typeMap[type] || "task";
}

/**
 * Map Jira priority to normalized WorkTicket priority.
 *
 * @param priority - Jira priority name
 * @returns Normalized priority level
 */
function mapJiraPriority(priority: string | undefined): WorkTicketPriority {
  if (!priority) return "medium";

  const priorityMap: Record<string, WorkTicketPriority> = {
    Highest: "highest",
    High: "high",
    Medium: "medium",
    Low: "low",
    Lowest: "lowest",
  };
  return priorityMap[priority] || "medium";
}

/**
 * Extract text content from Atlassian Document Format (ADF).
 *
 * Jira's description field uses ADF, a structured JSON format.
 * This function extracts plain text from the nested structure.
 *
 * @param adf - ADF content (may be null/undefined)
 * @returns Extracted plain text
 */
function extractAdfText(adf: unknown): string {
  if (!adf || typeof adf !== "object") return "";

  const adfDoc = adf as {
    content?: Array<{
      content?: Array<{ text?: string; type?: string }>;
      type?: string;
    }>;
  };

  if (!Array.isArray(adfDoc.content)) return "";

  return adfDoc.content
    .flatMap((block) => {
      if (!block.content) return [];
      return block.content.map((node) => {
        if (node.type === "text") return node.text || "";
        return "";
      });
    })
    .join(" ")
    .trim();
}

/**
 * Create a Jira REST API work tracker adapter.
 *
 * This adapter uses the Jira REST API v3 for issue retrieval. It requires
 * authentication via API token (created in Atlassian account security settings).
 *
 * ## Environment Variables
 *
 * - `JIRA_BASE_URL` - Your Atlassian URL (e.g., https://yourcompany.atlassian.net)
 * - `JIRA_USER_EMAIL` - Your Atlassian account email
 * - `JIRA_API_TOKEN` - API token from Atlassian account settings → Security → API tokens
 *
 * @param config - Optional configuration (overrides env vars)
 * @returns A WorkTrackerContract implementation for Jira
 *
 * @example
 * ```typescript
 * const adapter = createJiraAdapter()
 *
 * // Validate Jira connectivity
 * const valid = await adapter.validate?.()
 * if (!valid?.success) {
 *   console.error('Check JIRA_* environment variables')
 * }
 *
 * // Fetch ticket details
 * const result = await adapter.getTicket('PROJ-123')
 * if (result.success) {
 *   console.log(result.data.title)
 * }
 * ```
 */
export function createJiraAdapter(
  config: JiraAdapterConfig = {},
): WorkTrackerContract {
  // Configuration from params or environment variables
  const getBaseUrl = () => config.baseUrl || process.env.JIRA_BASE_URL;
  const getUserEmail = () => config.userEmail || process.env.JIRA_USER_EMAIL;
  const getApiToken = () => config.apiToken || process.env.JIRA_API_TOKEN;

  /**
   * Check that all required configuration is present.
   *
   * @returns Error message if config missing, null if valid
   */
  function checkConfig(): string | null {
    const baseUrl = getBaseUrl();
    const userEmail = getUserEmail();
    const apiToken = getApiToken();

    // Step 1: Presence check
    if (!baseUrl || !userEmail || !apiToken) {
      const missing: string[] = [];
      if (!baseUrl) missing.push("JIRA_BASE_URL");
      if (!userEmail) missing.push("JIRA_USER_EMAIL");
      if (!apiToken) missing.push("JIRA_API_TOKEN");

      return `Jira not configured. Missing: ${missing.join(", ")}. Set these environment variables to enable Jira integration.`;
    }

    // Step 2: Format validation
    const formatErrors: string[] = [];

    const urlResult = jiraBaseUrlSchema.safeParse(baseUrl);
    if (!urlResult.success) {
      formatErrors.push(urlResult.error.issues[0]?.message ?? "Invalid URL");
    }

    const emailResult = jiraEmailSchema.safeParse(userEmail);
    if (!emailResult.success) {
      formatErrors.push(
        emailResult.error.issues[0]?.message ?? "Invalid email",
      );
    }

    const tokenResult = jiraTokenSchema.safeParse(apiToken);
    if (!tokenResult.success) {
      formatErrors.push(
        tokenResult.error.issues[0]?.message ?? "Invalid token",
      );
    }

    if (formatErrors.length > 0) {
      return `Jira config validation failed: ${formatErrors.join("; ")}`;
    }

    return null;
  }

  /**
   * Build Basic auth header for Jira API.
   *
   * @returns Authorization header value
   */
  function buildAuthHeader(): string {
    const email = getUserEmail()!;
    const token = getApiToken()!;
    const credentials = Buffer.from(`${email}:${token}`).toString("base64");
    return `Basic ${credentials}`;
  }

  return {
    name: "jira" as const,

    /**
     * Retrieve Jira issue details by key.
     *
     * Uses Jira REST API v3 to fetch issue data. Handles authentication,
     * error responses, and maps the response to a WorkTicket.
     *
     * @param ticketId - Jira issue key (e.g., "PROJ-123")
     * @returns Issue details mapped to WorkTicket or error
     */
    async getTicket(ticketId: string): Promise<AdapterResult<WorkTicket>> {
      // Validate configuration
      const configError = checkConfig();
      if (configError) {
        return { success: false, error: configError };
      }

      const baseUrl = getBaseUrl()!;

      if (!JIRA_TICKET_ID_PATTERN.test(ticketId)) {
        return {
          success: false,
          error: `Invalid Jira ticket ID format: "${ticketId}". Expected format: PROJ-123`,
        };
      }

      if (!baseUrl.startsWith("https://")) {
        return { success: false, error: "JIRA_BASE_URL must use HTTPS" };
      }

      // Build API URL with selected fields
      const apiUrl = `${baseUrl}/rest/api/3/issue/${ticketId}?fields=summary,description,issuetype,priority,status,assignee`;

      try {
        const response = await fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: buildAuthHeader(),
            Accept: "application/json",
          },
        });

        // Handle HTTP error responses
        if (response.status === 401) {
          return {
            success: false,
            error: "Jira authentication failed. Check API token.",
          };
        }

        if (response.status === 404) {
          return {
            success: false,
            error: `Ticket ${ticketId} not found.`,
          };
        }

        if (!response.ok) {
          return {
            success: false,
            error: `Jira API error: ${response.status}`,
          };
        }

        // Parse and validate response
        const rawData = await response.json();
        const parseResult = jiraIssueResponseSchema.safeParse(rawData);
        if (!parseResult.success) {
          return {
            success: false,
            error: `Jira API returned unexpected response format: ${parseResult.error.message}`,
          };
        }
        const data = parseResult.data;

        // Map to WorkTicket
        const ticket: WorkTicket = {
          id: ticketId,
          title: data.fields.summary,
          description: extractAdfText(data.fields.description),
          type: mapJiraType(data.fields.issuetype?.name),
          status: data.fields.status?.name || "Unknown",
          priority: mapJiraPriority(data.fields.priority?.name),
          assignee: data.fields.assignee?.displayName,
          url: `${baseUrl}/browse/${ticketId}`,
        };

        return { success: true, data: ticket };
      } catch (error) {
        return {
          success: false,
          error: `Jira API request failed: ${sanitizeJiraError(error)}`,
        };
      }
    },

    /**
     * Validate Jira configuration and API connectivity.
     *
     * Checks that environment variables are set and tests API connectivity
     * by calling the /rest/api/3/myself endpoint.
     *
     * @returns true if configuration is valid and API is reachable
     */
    async validate(): Promise<AdapterResult<boolean>> {
      // Validate configuration
      const configError = checkConfig();
      if (configError) {
        return { success: false, error: configError };
      }

      const baseUrl = getBaseUrl()!;

      if (!baseUrl.startsWith("https://")) {
        return { success: false, error: "JIRA_BASE_URL must use HTTPS" };
      }

      try {
        // Test API connectivity with /myself endpoint
        const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
          method: "GET",
          headers: {
            Authorization: buildAuthHeader(),
            Accept: "application/json",
          },
        });

        if (response.status === 401) {
          return {
            success: false,
            error: "Jira authentication failed. Check API token.",
          };
        }

        if (!response.ok) {
          return {
            success: false,
            error: `Jira API validation failed: ${response.status}`,
          };
        }

        return { success: true, data: true };
      } catch (error) {
        return {
          success: false,
          error: `Jira API connection failed: ${sanitizeJiraError(error)}`,
        };
      }
    },
  };
}
