/**
 * Plugin manifest Zod schemas and TypeScript types for the Luca Framework.
 *
 * Defines the structure for plugin packaging metadata, including author
 * information, versioning, and keywords. Component discovery (commands,
 * agents, skills, hooks) relies on Claude Code's auto-discovery from
 * default directories rather than explicit manifest arrays.
 * All schema properties use snake_case per API conventions.
 *
 * @example
 * ```typescript
 * import { pluginManifestSchema, generatePluginManifest } from './plugin.types';
 *
 * // Validate an external manifest
 * const result = pluginManifestSchema.safeParse(rawManifest);
 *
 * // Generate a manifest with Luca defaults
 * const manifest = generatePluginManifest({ name: 'my-cool-plugin' });
 * ```
 */
import { z } from "zod";

/**
 * Regex pattern enforcing kebab-case plugin names.
 *
 * Allows lowercase letters, digits, and hyphens. Must start and end with
 * a lowercase letter or digit. Minimum two characters when a hyphen is
 * present, single-word names are also valid.
 *
 * @example
 * ```typescript
 * KEBAB_CASE_REGEX.test('my-plugin')   // true
 * KEBAB_CASE_REGEX.test('MyPlugin')    // false
 * KEBAB_CASE_REGEX.test('my_plugin')   // false
 * ```
 */
export const KEBAB_CASE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Zod schema for plugin author metadata.
 *
 * Represents the person or organisation that authored the plugin.
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```typescript
 * const author = pluginAuthorSchema.parse({
 *   name: 'Alec Sibilia',
 *   email: 'alec@example.com',
 *   url: 'https://example.com',
 * });
 * ```
 */
export const pluginAuthorSchema = z.object({
  /** Display name of the plugin author (required). */
  name: z.string().min(1),
  /** Contact email for the plugin author (optional). */
  email: z.string().email().optional(),
  /** Homepage or profile URL for the plugin author (optional). */
  url: z.string().url().optional(),
});

/**
 * TypeScript type inferred from {@link pluginAuthorSchema}.
 */
export type PluginAuthor = z.infer<typeof pluginAuthorSchema>;

/**
 * Zod schema for the full plugin manifest.
 *
 * The manifest describes a Luca plugin package: its identity, authorship,
 * licensing, and keywords. Components (commands, agents, skills, hooks)
 * are auto-discovered from default directories by Claude Code. Only
 * `name` is required; every other field carries a sensible default so
 * that minimal manifests are valid.
 *
 * **CRITICAL**: Uses snake_case for all properties per API conventions.
 *
 * @example
 * ```typescript
 * const manifest = pluginManifestSchema.parse({
 *   name: 'my-cool-plugin',
 *   version: '1.0.0',
 *   description: 'A plugin that does cool things',
 *   author: { name: 'Alec Sibilia' },
 * });
 * ```
 */
export const pluginManifestSchema = z.object({
  /** Unique plugin name in kebab-case (required). */
  name: z
    .string()
    .min(1)
    .regex(
      KEBAB_CASE_REGEX,
      'Plugin name must be kebab-case (e.g. "my-plugin")',
    ),

  /** Semver version string. Defaults to "0.1.0". */
  version: z.string().default("0.1.0"),

  /** Human-readable description of the plugin's purpose. */
  description: z.string().optional(),

  /** Author metadata. */
  author: pluginAuthorSchema.optional(),

  /** URL to the plugin's homepage or documentation site. */
  homepage: z.string().url().optional(),

  /** URL to the plugin's source code repository. */
  repository: z.string().url().optional(),

  /** SPDX license identifier. Defaults to "MIT". */
  license: z.string().default("MIT"),

  /** Searchable keywords / tags for discovery. Defaults to empty array. */
  keywords: z.array(z.string()).default([]),
});

/**
 * TypeScript type inferred from {@link pluginManifestSchema}.
 */
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

/**
 * Input type for {@link generatePluginManifest}. Only `name` is required;
 * all other fields are optional and will receive Luca defaults when omitted.
 */
export type PluginManifestInput = z.input<typeof pluginManifestSchema>;

/**
 * Generate a valid plugin manifest with Luca defaults.
 *
 * Accepts a partial manifest (only `name` is required) and fills in all
 * missing fields with sensible defaults defined in
 * {@link pluginManifestSchema}. The result is guaranteed to pass schema
 * validation.
 *
 * @param input - Partial manifest data. Must include at least `name`.
 * @returns A fully-populated {@link PluginManifest}.
 *
 * @example
 * ```typescript
 * const manifest = generatePluginManifest({ name: 'my-plugin' });
 * // {
 * //   name: 'my-plugin',
 * //   version: '0.1.0',
 * //   license: 'MIT',
 * //   keywords: [],
 * // }
 * ```
 *
 * @example
 * ```typescript
 * const manifest = generatePluginManifest({
 *   name: 'analytics-plugin',
 *   version: '2.0.0',
 *   description: 'PostHog analytics integration',
 *   author: { name: 'Alec Sibilia', email: 'alec@example.com' },
 *   keywords: ['analytics', 'posthog'],
 * });
 * ```
 */
export function generatePluginManifest(
  input: PluginManifestInput,
): PluginManifest {
  return pluginManifestSchema.parse(input);
}
