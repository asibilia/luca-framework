/**
 * Deploy manifest Zod schemas and inferred types.
 *
 * Defines the structure for `~/.luca/manifests/deploy-manifest.json`, which
 * tracks globally deployed Luca artifacts. This is distinct from the per-project
 * `LucaManifest` type used in `.planning/manifest.json`.
 *
 * The deploy manifest enables:
 * - `luca update` to diff deployed vs current artifacts
 * - `luca reinit` to know what to remove
 * - Version tracking for upgrade safety
 *
 * Uses snake_case for all property names per API conventions.
 *
 * @see packages/luca-framework/src/utils/manifest.ts for hashFile() and hashContent()
 * @see packages/luca-framework/src/utils/luca-home.ts for ~/.luca/ path resolution
 */

import { z } from "zod";

// ─── Source type enum ────────────────────────────────────────────────────────

/**
 * Artifact source types for deployed files.
 *
 * Each deployed artifact is tagged with its source type so the deploy
 * system can categorize and manage them independently.
 */
export const DEPLOY_SOURCE_TYPES = [
  "agent",
  "skill",
  "hook",
  "rule",
  "statusline",
  "lib",
] as const;

export const DeploySourceTypeSchema = z.enum(DEPLOY_SOURCE_TYPES);

/** Source type for a deployed artifact. */
export type DeploySourceType = z.infer<typeof DeploySourceTypeSchema>;

// ─── Artifact entry schema ───────────────────────────────────────────────────

/**
 * Schema for a single deployed artifact entry.
 *
 * Each artifact is identified by its relative path within `~/.claude/`
 * and tracked with a SHA-256 content hash and source type.
 */
export const DeployArtifactEntrySchema = z.object({
  /** SHA-256 hex hash of the deployed file content. */
  hash: z.string(),
  /** Classification of the artifact source. */
  source_type: DeploySourceTypeSchema,
});

/** A single deployed artifact entry. */
export type DeployArtifactEntry = z.infer<typeof DeployArtifactEntrySchema>;

// ─── Deploy manifest schema ─────────────────────────────────────────────────

/**
 * Schema for the global deploy manifest at `~/.luca/manifests/deploy-manifest.json`.
 *
 * Tracks all artifacts deployed to `~/.claude/` by `luca deploy` or `luca init`.
 * The manifest is written atomically after each deploy operation.
 *
 * @example
 * ```typescript
 * const manifest: DeployManifest = {
 *   deployed_at: "2026-03-16T12:00:00.000Z",
 *   package_version: "5.0.0",
 *   mode: "copy",
 *   source_path: "/Users/you/.bun/install/global/node_modules/luca-framework",
 *   settings_backup_path: "/Users/you/.luca/backups/settings-2026-03-16T12-00-00-000Z.json",
 *   artifacts: {
 *     "agents/lu-router.md": { hash: "a1b2c3...", source_type: "agent" },
 *     "hooks/session-start.sh": { hash: "d4e5f6...", source_type: "hook" },
 *   },
 * };
 * ```
 */
export const DeployManifestSchema = z.object({
  /** ISO 8601 timestamp of when the deploy was performed. */
  deployed_at: z.string(),
  /** Luca framework version that performed the deploy (from LUCA_VERSION). */
  package_version: z.string(),
  /** Deployment mode. "copy" is the only mode for npm global installs. */
  mode: z.enum(["copy"]),
  /** Absolute path to the package root that sourced the artifacts. */
  source_path: z.string(),
  /** Absolute path to the settings.json backup taken during deploy. Optional if no settings existed. */
  settings_backup_path: z.string().optional(),
  /** Map of relative path (within ~/.claude/) to artifact metadata. */
  artifacts: z.record(z.string(), DeployArtifactEntrySchema),
});

/** Global deploy manifest tracking all artifacts deployed to ~/.claude/. */
export type DeployManifest = z.infer<typeof DeployManifestSchema>;

// ─── Source type inference ──────────────────────────────────────────────────

/**
 * Infer the deploy source type from a relative path within `~/.claude/`.
 *
 * Maps directory prefixes to their corresponding `DeploySourceType`.
 * Falls back to `"lib"` for unrecognized paths.
 *
 * @param relativePath - Path relative to `~/.claude/`.
 * @returns Appropriate `DeploySourceType`.
 *
 * @example
 * ```typescript
 * inferSourceType("agents/lu-router.md")     // "agent"
 * inferSourceType("hooks/_lib/shared.sh")    // "lib"
 * inferSourceType("hooks/session-start.sh")  // "hook"
 * inferSourceType("statusline.sh")           // "statusline"
 * ```
 */
export function inferSourceType(relativePath: string): DeploySourceType {
  if (relativePath.startsWith("agents/")) return "agent";
  if (relativePath.startsWith("skills/")) return "skill";
  if (relativePath.startsWith("hooks/")) {
    return relativePath.startsWith("hooks/_lib/") ? "lib" : "hook";
  }
  if (relativePath.startsWith("rules/")) return "rule";
  if (relativePath === "statusline.sh") return "statusline";
  return "lib";
}
