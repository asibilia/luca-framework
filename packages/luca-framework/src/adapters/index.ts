/**
 * Work Tracker Adapters
 *
 * Pure barrel file — re-exports only. All logic lives in adapter-factory.ts
 * and individual adapter modules.
 */

// Factory function and config
export { createWorkTrackerAdapter } from "./adapter-factory";
export type { WorkTrackerConfig } from "./adapter-factory";

// Individual adapters
export { createPlaceholderAdapter } from "./placeholder-adapter";
export { createGitHubAdapter } from "./github-adapter";
export { createJiraAdapter } from "./jira-adapter";

// Re-export types for convenience
export type {
  WorkTrackerContract,
  WorkTrackerType,
  WorkTicket,
  AdapterResult,
} from "../contracts/work-tracker";
