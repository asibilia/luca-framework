export interface ProjectContext {
  /** Whether package.json exists */
  hasPackageJson: boolean;
  /** Whether .git directory exists */
  hasGit: boolean;
  /** Whether Luca is already installed */
  hasLuca: boolean;
  /** Detected stack from dependencies */
  detectedStack: 'react-ts' | 'react' | 'node-ts' | 'node' | 'unknown';
  /** Whether TypeScript is configured */
  hasTypeScript: boolean;
  /** Project name from package.json */
  projectName: string | null;
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

export interface LucaConfig {
  branding: BrandingConfig;
  stack: string;
  workTracker: 'jira' | 'github' | 'none';
}

export interface LucaManifest {
  version: string;
  installedAt: string;
  updatedAt: string;
  branding: BrandingConfig;
  stack: string;
  workTracker: string;
  files: Record<string, {
    originalHash: string;
    source: 'framework' | 'user';
  }>;
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
  status: 'unchanged' | 'user-modified' | 'new' | 'deleted';
  /** Hash from original manifest (null if new file) */
  originalHash: string | null;
  /** Hash of current file on disk (null if deleted) */
  currentHash: string | null;
  /** Hash of new framework version content */
  newHash: string;
}
