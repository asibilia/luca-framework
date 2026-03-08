export interface ProjectContext {
  /** Whether package.json exists */
  hasPackageJson: boolean;
  /** Whether .git directory exists */
  hasGit: boolean;
  /** Whether Luca is already installed */
  hasLuca: boolean;
  /** Detected stack from dependencies */
  detectedStack: "react-ts" | "react" | "node-ts" | "node" | "unknown";
  /** Whether TypeScript is configured */
  hasTypeScript: boolean;
  /** Project name from package.json */
  projectName: string | null;
  /** Harness platforms detected on disk (e.g., ["claude", "cursor"]) */
  detectedHarnesses?: string[];
  /** Suggested first command based on detected harness (e.g., "/lu") */
  suggestedFirstCommand?: string;
  /** Project description from package.json (used in tour personalization) */
  projectDescription?: string | null;
  /** Whether the project has existing source code (src/, app/, or lib/) */
  hasExistingSource?: boolean;
}

/**
 * Statistics about files installed during generateFiles.
 *
 * Tracks counts by category for display in the post-init tour.
 * All counts default to 0 when not applicable.
 */
export interface InstallationStats {
  /** Number of agent definition files installed */
  agent_count: number;
  /** Number of skill directories installed */
  skill_count: number;
  /** Number of rule files installed */
  rule_count: number;
  /** Number of hook scripts installed */
  hook_count: number;
  /** Harness platforms that were actually scaffolded */
  harnesses_installed: HarnessId[];
}

export interface BrandingConfig {
  /** Display name for the framework (e.g., "Luca") */
  frameworkName: string;
  /** Command prefix for skills (e.g., "lu") */
  commandPrefix: string;
  /** Regex pattern for ticket IDs (e.g., "[A-Z]+-\\d+") */
  ticketPattern: string;
  /** Placeholder ticket ID (e.g., "PROJ-0000") */
  placeholderTicket: string;
}

/**
 * Configuration for approval gates.
 *
 * Controls when Luca asks for user confirmation before
 * executing operations. Secure defaults: all enabled.
 */
export interface ApprovalConfig {
  /** Require approval before executing generated plans */
  plans: boolean;
  /** Require approval for destructive operations (file deletion, git force) */
  destructive: boolean;
  /** Require approval for external API calls */
  external: boolean;
  /** Custom approval triggers (regex patterns matching operation names) */
  custom_triggers: string[];
}

/** Supported AI harness platforms */
export type HarnessId = "claude" | "cursor" | "pi";

/**
 * Progressive configuration preset identifiers.
 *
 * Presets control the default complexity of a Luca project:
 * - starter: Minimal setup, single harness, basic features
 * - standard: Balanced defaults for most projects (default)
 * - full: All harnesses, all features enabled
 */
export type PresetId = "starter" | "standard" | "full";

export interface LucaConfig {
  branding: BrandingConfig;
  stack: string;
  workTracker: "jira" | "github" | "none";
  /** Selected harness platforms for scaffolding */
  harnesses?: HarnessId[];
  /** Approval gate configuration */
  approvals?: ApprovalConfig;
  /** Progressive configuration preset */
  preset?: PresetId;
}

/** Source tracking for manifest file entries */
export type FileSource = "framework" | "user" | `harness:${HarnessId}`;

export interface LucaManifest {
  version: string;
  installedAt: string;
  updatedAt: string;
  branding: BrandingConfig;
  stack: string;
  workTracker: string;
  /** Harness platforms installed in this project (defaults to ['claude', 'cursor'] for backward compat) */
  harnesses?: HarnessId[];
  files: Record<
    string,
    {
      originalHash: string;
      source: FileSource;
    }
  >;
}

/**
 * Result of comparing a file between manifest, filesystem, and new version.
 *
 * Used during update operations to determine safe update strategy:
 * - unchanged: Safe to update (original === current)
 * - user-modified: Conflict - user changed the file
 * - new: Safe to add (not in original manifest)
 * - deleted: Conflict - file was removed from filesystem
 */
export interface FileComparison {
  /** Relative path to the file */
  path: string;
  /** Comparison result status */
  status: "unchanged" | "user-modified" | "new" | "deleted";
  /** Hash from original manifest (null if new file) */
  originalHash: string | null;
  /** Hash of current file on disk (null if deleted) */
  currentHash: string | null;
  /** Hash of new framework version content */
  newHash: string;
}
