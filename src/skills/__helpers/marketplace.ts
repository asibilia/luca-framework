/**
 * Plugin marketplace foundation.
 *
 * Provides schemas and operations for a local plugin registry.
 * Plugins bundle skills, rules, and hooks into distributable packages
 * with metadata for discovery and validation.
 *
 * This is a LOCAL-ONLY registry -- no remote fetching. It defines the
 * data model and search/validation operations that a future remote
 * marketplace can build on.
 *
 * Source: src/skills/__helpers/marketplace.ts
 */

import { z } from "zod";

// ---- Plugin registry schemas ----

/**
 * Schema for a single plugin registry entry.
 *
 * Describes a distributable plugin package that bundles skills, rules,
 * and/or hooks for the Luca framework.
 */
export const PluginRegistryEntrySchema = z.object({
  /** Unique plugin name (kebab-case) */
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, "Plugin name must be kebab-case"),
  /** Semver version string */
  version: z.string().regex(/^\d+\.\d+\.\d+/, "Version must be semver"),
  /** Plugin author or organization */
  author: z.string().min(1),
  /** Short description of what the plugin provides */
  description: z.string().min(1),
  /** Skill names bundled in this plugin */
  skills: z.array(z.string()).default([]),
  /** Rule names bundled in this plugin */
  rules: z.array(z.string()).default([]),
  /** Hook names bundled in this plugin */
  hooks: z.array(z.string()).default([]),
  /** Optional keywords for search discovery */
  keywords: z.array(z.string()).default([]),
  /** Optional minimum Luca framework version required */
  min_luca_version: z.string().optional(),
});

export type PluginRegistryEntry = z.infer<typeof PluginRegistryEntrySchema>;

/**
 * Schema for a local plugin registry (array of entries).
 */
export const PluginRegistrySchema = z.array(PluginRegistryEntrySchema);
export type PluginRegistry = z.infer<typeof PluginRegistrySchema>;

// ---- Search ----

/**
 * Search a plugin registry by keyword.
 *
 * Matches against name, description, keywords, skills, rules, and hooks.
 * Case-insensitive substring matching.
 *
 * @param query - Search keyword(s)
 * @param registry - Array of plugin registry entries to search
 * @returns Matching entries, ordered by relevance (name match first)
 *
 * @example
 * ```typescript
 * const results = searchRegistry("git", myRegistry);
 * // Returns plugins whose name/description/keywords/skills/rules/hooks contain "git"
 * ```
 */
export function searchRegistry(
  query: string,
  registry: PluginRegistry,
): PluginRegistry {
  const lowerQuery = query.toLowerCase();

  const scored = registry
    .map((entry) => {
      let score = 0;

      // Name match is highest priority
      if (entry.name.toLowerCase().includes(lowerQuery)) {
        score += 10;
      }

      // Description match
      if (entry.description.toLowerCase().includes(lowerQuery)) {
        score += 5;
      }

      // Keywords match
      if (entry.keywords.some((kw) => kw.toLowerCase().includes(lowerQuery))) {
        score += 3;
      }

      // Skills/rules/hooks match
      const bundledNames = [...entry.skills, ...entry.rules, ...entry.hooks];
      if (bundledNames.some((n) => n.toLowerCase().includes(lowerQuery))) {
        score += 2;
      }

      return { entry, score };
    })
    .filter(({ score }) => score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.map(({ entry }) => entry);
}

// ---- Validation ----

/**
 * Validate that a plugin meets registry entry requirements.
 *
 * Checks schema compliance and additional business rules:
 * - Must bundle at least one skill, rule, or hook
 * - Name uniqueness is NOT checked here (registry-level concern)
 *
 * @param plugin - Raw plugin data to validate
 * @returns Validation result with success flag and parsed data or error
 *
 * @example
 * ```typescript
 * const result = validatePlugin({
 *   name: "my-plugin",
 *   version: "1.0.0",
 *   author: "dev",
 *   description: "A plugin",
 *   skills: ["my-skill"],
 *   rules: [],
 *   hooks: [],
 * });
 *
 * if (result.success) {
 *   console.log("Valid:", result.data);
 * } else {
 *   console.error("Invalid:", result.error);
 * }
 * ```
 */
export function validatePlugin(plugin: unknown): {
  success: boolean;
  data?: PluginRegistryEntry;
  error?: string;
} {
  const parseResult = PluginRegistryEntrySchema.safeParse(plugin);

  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  }

  const entry = parseResult.data;

  // Business rule: must bundle at least one asset
  if (
    entry.skills.length === 0 &&
    entry.rules.length === 0 &&
    entry.hooks.length === 0
  ) {
    return {
      success: false,
      error: "Plugin must include at least one skill, rule, or hook",
    };
  }

  return { success: true, data: entry };
}
