/**
 * Portable cognitive profiles for cross-project knowledge transfer.
 *
 * Exports a project's cognitive state (brain + memory) into a portable
 * format that can be imported into another project. Handles merging
 * with existing data to avoid duplicates.
 *
 * Includes global memory support for cross-project learning:
 * - exportToGlobalMemory: writes portable entries to ~/.luca/global-memory.json
 * - loadGlobalMemory: reads the global memory profile
 * - mergeGlobalEntries: deduplicates global entries against local entries
 *
 * @module memory/cognitive-profile
 */
import { z } from "zod";
import filter from "lodash/filter";
import find from "lodash/find";
import isEmpty from "lodash/isEmpty";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

import { brainSchema } from "../__schemas/memory.schemas";
import { memoryEntrySchema } from "../__schemas/memory.schemas";

import type { Brain, MemoryEntry } from "../__schemas/memory.schemas";

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Portable cognitive profile schema.
 *
 * Contains a snapshot of project brain data and curated memory entries
 * that can be transferred between projects.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const CognitiveProfileSchema = z.object({
  /** Profile format version for forward compatibility */
  version: z.literal(1).default(1),
  /** ISO 8601 timestamp when the profile was exported */
  exported_at: z.string(),
  /** Source project name for provenance tracking */
  source_project: z.string(),
  /** Snapshot of project brain data */
  brain: brainSchema,
  /** Curated memory entries included in the profile */
  entries: z.array(memoryEntrySchema).default([]),
  /** Tags summarizing the profile's domain coverage */
  domain_tags: z.array(z.string()).default([]),
});

/** Portable cognitive profile type. */
export type CognitiveProfile = z.infer<typeof CognitiveProfileSchema>;

/**
 * Result of a profile import operation.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const ImportResultSchema = z.object({
  /** Number of new entries added */
  entries_added: z.number().int().nonnegative(),
  /** Number of entries skipped (duplicates) */
  entries_skipped: z.number().int().nonnegative(),
  /** Whether the brain was updated with imported data */
  brain_updated: z.boolean(),
  /** Human-readable summary of the import */
  summary: z.string(),
});

export type ImportResult = z.infer<typeof ImportResultSchema>;

/**
 * Options for controlling which memory entries are exported.
 *
 * Portable categories (patterns, preferences) are always included.
 * Decisions are project-specific by default but can be opted in.
 * Pitfalls are generally portable and included by default.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const ExportOptionsSchema = z.object({
  /** Categories that are always portable across projects */
  portable_categories: z
    .array(z.enum(["pattern", "preference"]))
    .default(["pattern", "preference"]),
  /** Whether to include decisions (project-specific by default) */
  include_decisions: z.boolean().default(false),
  /** Whether to include pitfalls (generally portable) */
  include_pitfalls: z.boolean().default(true),
  /** Minimum confidence level for exported entries */
  min_confidence: z.enum(["low", "medium", "high"]).default("medium"),
});

/** Export options type. */
export type ExportOptions = z.infer<typeof ExportOptionsSchema>;

/**
 * Result of a global memory merge operation.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const MergeResultSchema = z.object({
  /** Number of new entries added from global memory */
  entries_added: z.number().int().nonnegative(),
  /** Number of entries skipped as duplicates */
  entries_skipped: z.number().int().nonnegative(),
  /** Source projects that contributed entries */
  source_projects: z.array(z.string()),
  /** Human-readable summary */
  summary: z.string(),
});

export type MergeResult = z.infer<typeof MergeResultSchema>;

/** Path to the global memory profile. */
const GLOBAL_MEMORY_DIR = join(homedir(), ".luca");
const GLOBAL_MEMORY_PATH = join(GLOBAL_MEMORY_DIR, "global-memory.json");

/** Confidence levels ordered for comparison. */
const CONFIDENCE_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Export a portable cognitive profile from brain content and memory entries.
 *
 * Filters entries based on configurable export options. By default:
 * - Includes patterns, preferences, and pitfalls with medium+ confidence
 * - Excludes decisions (project-specific by default)
 * - Sets source_project on all exported entries for provenance tracking
 *
 * @param brain - Parsed brain data
 * @param memoryEntries - All memory entries from MEMORY.md
 * @param options - Optional export configuration (uses defaults if omitted)
 * @returns A portable CognitiveProfile
 *
 * @example
 * ```typescript
 * const profile = exportCognitiveProfile(brain, entries);
 * await Bun.write("profile.json", JSON.stringify(profile, null, 2));
 * ```
 *
 * @example
 * ```typescript
 * // Include decisions explicitly
 * const profile = exportCognitiveProfile(brain, entries, { include_decisions: true });
 * ```
 */
export function exportCognitiveProfile(
  brain: Brain,
  memoryEntries: MemoryEntry[],
  options?: Partial<ExportOptions>,
): CognitiveProfile {
  const opts = ExportOptionsSchema.parse(options ?? {});
  const minConfidenceLevel = CONFIDENCE_ORDER[opts.min_confidence] ?? 1;

  // Build the set of categories to include
  const allowedCategories = new Set<string>(opts.portable_categories);
  if (opts.include_pitfalls) {
    allowedCategories.add("pitfall");
  }
  if (opts.include_decisions) {
    allowedCategories.add("decision");
  }

  // Filter entries by category and confidence
  const transferable = filter(
    memoryEntries,
    (entry) =>
      allowedCategories.has(entry.category) &&
      (CONFIDENCE_ORDER[entry.confidence] ?? 0) >= minConfidenceLevel,
  );

  // Set source_project on all exported entries for provenance
  const taggedEntries: MemoryEntry[] = transferable.map((entry) => ({
    ...entry,
    source_project: brain.project_name,
  }));

  // Collect unique domain tags from included entries
  const tagSet = new Set<string>();
  for (const entry of taggedEntries) {
    for (const tag of entry.tags) {
      tagSet.add(tag);
    }
  }

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    source_project: brain.project_name,
    brain,
    entries: taggedEntries,
    domain_tags: Array.from(tagSet).sort(),
  };
}

/**
 * Export portable learnings to the global memory file (~/.luca/global-memory.json).
 *
 * Creates the ~/.luca/ directory if it does not exist. If the global memory
 * file already exists, merges new entries (deduplicates by ID and title).
 * If it does not exist, creates it with the exported profile.
 *
 * @param brain - Parsed brain data
 * @param memoryEntries - All memory entries from MEMORY.md
 * @param options - Optional export configuration
 * @returns Summary of what was exported
 *
 * @example
 * ```typescript
 * const summary = await exportToGlobalMemory(brain, entries);
 * console.log(summary.summary);
 * ```
 */
export async function exportToGlobalMemory(
  brain: Brain,
  memoryEntries: MemoryEntry[],
  options?: Partial<ExportOptions>,
): Promise<{
  entries_exported: number;
  entries_skipped: number;
  summary: string;
}> {
  const profile = exportCognitiveProfile(brain, memoryEntries, options);

  // Ensure ~/.luca/ directory exists
  await mkdir(GLOBAL_MEMORY_DIR, { recursive: true });

  // Check if global memory file exists
  const globalFile = Bun.file(GLOBAL_MEMORY_PATH);
  const exists = await globalFile.exists();

  if (!exists) {
    // Create new global memory file
    await Bun.write(GLOBAL_MEMORY_PATH, JSON.stringify(profile, null, 2));
    return {
      entries_exported: profile.entries.length,
      entries_skipped: 0,
      summary: `Created global memory with ${profile.entries.length} entries from ${brain.project_name}.`,
    };
  }

  // Merge with existing global memory
  const existingRaw = await globalFile.json();
  const existingResult = CognitiveProfileSchema.safeParse(existingRaw);

  if (!existingResult.success) {
    // Existing file is invalid -- overwrite with new profile
    await Bun.write(GLOBAL_MEMORY_PATH, JSON.stringify(profile, null, 2));
    return {
      entries_exported: profile.entries.length,
      entries_skipped: 0,
      summary: `Replaced invalid global memory with ${profile.entries.length} entries from ${brain.project_name}.`,
    };
  }

  const existing = existingResult.data;

  // Deduplicate by ID and normalized title
  const existingIds = new Set(existing.entries.map((e) => e.id));
  const existingTitles = new Set(
    existing.entries.map((e) => e.title.toLowerCase().trim()),
  );

  const newEntries: MemoryEntry[] = [];
  let skipped = 0;

  for (const entry of profile.entries) {
    if (existingIds.has(entry.id)) {
      skipped++;
      continue;
    }
    if (existingTitles.has(entry.title.toLowerCase().trim())) {
      skipped++;
      continue;
    }
    newEntries.push(entry);
  }

  // Merge entries and domain tags
  const mergedEntries = [...existing.entries, ...newEntries];
  const mergedTags = new Set([...existing.domain_tags, ...profile.domain_tags]);

  const merged: CognitiveProfile = {
    ...existing,
    exported_at: new Date().toISOString(),
    entries: mergedEntries,
    domain_tags: Array.from(mergedTags).sort(),
  };

  await Bun.write(GLOBAL_MEMORY_PATH, JSON.stringify(merged, null, 2));

  return {
    entries_exported: newEntries.length,
    entries_skipped: skipped,
    summary: `Exported ${newEntries.length} entries from ${brain.project_name} to global memory (${skipped} skipped as duplicates). Total: ${mergedEntries.length} entries.`,
  };
}

// ─── Import ──────────────────────────────────────────────────────────────────

/**
 * Import a cognitive profile into an existing project.
 *
 * Merges brain preferences and adds non-duplicate memory entries.
 * Does NOT overwrite existing brain identity fields (project_name,
 * domain, purpose) — only merges development_preferences.
 *
 * @param profile - The cognitive profile to import
 * @param existingBrain - The current project's brain data
 * @param existingMemory - The current project's memory entries
 * @returns Updated brain, merged entries, and an import summary
 *
 * @example
 * ```typescript
 * const profile = JSON.parse(await Bun.file("profile.json").text());
 * const result = importCognitiveProfile(profile, brain, entries);
 * console.log(result.summary);
 * ```
 */
export function importCognitiveProfile(
  profile: CognitiveProfile,
  existingBrain: Brain,
  existingMemory: MemoryEntry[],
): {
  brain: Brain;
  entries: MemoryEntry[];
  result: ImportResult;
} {
  // Merge development preferences (imported prefs fill gaps, don't overwrite)
  const mergedPrefs = { ...existingBrain.development_preferences };
  let brainUpdated = false;

  for (const [key, value] of Object.entries(
    profile.brain.development_preferences,
  )) {
    if (isEmpty(mergedPrefs[key])) {
      mergedPrefs[key] = value;
      brainUpdated = true;
    }
  }

  const updatedBrain: Brain = {
    ...existingBrain,
    development_preferences: mergedPrefs,
    updated_at: new Date().toISOString(),
  };

  // Deduplicate entries by id
  const existingIds = new Set(existingMemory.map((e) => e.id));
  const newEntries: MemoryEntry[] = [];
  let skipped = 0;

  for (const entry of profile.entries) {
    if (existingIds.has(entry.id)) {
      skipped++;
      continue;
    }

    // Also check for title-based duplicates
    const titleDup = find(
      existingMemory,
      (e) => e.title.toLowerCase() === entry.title.toLowerCase(),
    );
    if (titleDup) {
      skipped++;
      continue;
    }

    newEntries.push({
      ...entry,
      agent: `imported:${profile.source_project}`,
      recall_count: 0,
      last_recalled_at: undefined,
    });
  }

  const mergedEntries = [...existingMemory, ...newEntries];

  const result: ImportResult = {
    entries_added: newEntries.length,
    entries_skipped: skipped,
    brain_updated: brainUpdated,
    summary: `Imported ${newEntries.length} entries from ${profile.source_project} (${skipped} skipped as duplicates). Brain preferences ${brainUpdated ? "updated" : "unchanged"}.`,
  };

  return { brain: updatedBrain, entries: mergedEntries, result };
}

// ─── Global Memory ──────────────────────────────────────────────────────────

/**
 * Load the global memory profile from ~/.luca/global-memory.json.
 *
 * Returns null if the file does not exist or cannot be parsed.
 * This is a safe, non-throwing function suitable for use during pre-flight.
 *
 * @returns Parsed CognitiveProfile or null
 *
 * @example
 * ```typescript
 * const globalProfile = await loadGlobalMemory();
 * if (globalProfile) {
 *   console.log(`Loaded ${globalProfile.entries.length} global entries`);
 * }
 * ```
 */
export async function loadGlobalMemory(): Promise<CognitiveProfile | null> {
  try {
    const file = Bun.file(GLOBAL_MEMORY_PATH);
    if (!(await file.exists())) {
      return null;
    }

    const raw = await file.json();
    const result = CognitiveProfileSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Normalize a title for deduplication comparison.
 *
 * Converts to lowercase, removes punctuation, and collapses whitespace.
 *
 * @param title - Raw title string
 * @returns Normalized title string
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Merge global memory entries with local memory entries.
 *
 * Deduplicates by ID and normalized title (case-insensitive).
 * Local entries always take precedence over global ones.
 * Imported entries are tagged with their source_project.
 *
 * @param globalEntries - Entries from the global memory profile
 * @param localEntries - Current project's local memory entries
 * @returns Merged entries array and an import summary
 *
 * @example
 * ```typescript
 * const globalProfile = await loadGlobalMemory();
 * if (globalProfile) {
 *   const { entries, result } = mergeGlobalEntries(globalProfile.entries, localEntries);
 *   console.log(result.summary);
 * }
 * ```
 */
export function mergeGlobalEntries(
  globalEntries: MemoryEntry[],
  localEntries: MemoryEntry[],
): { entries: MemoryEntry[]; result: MergeResult } {
  // Build lookup sets from local entries (local takes precedence)
  const localIds = new Set(localEntries.map((e) => e.id));
  const localTitles = new Set(localEntries.map((e) => normalizeTitle(e.title)));

  const added: MemoryEntry[] = [];
  let skipped = 0;
  const sourceProjects = new Set<string>();

  for (const entry of globalEntries) {
    // Track source projects
    if (entry.source_project) {
      sourceProjects.add(entry.source_project);
    }

    // Skip if local already has this entry by ID
    if (localIds.has(entry.id)) {
      skipped++;
      continue;
    }

    // Skip if local already has this entry by normalized title
    if (localTitles.has(normalizeTitle(entry.title))) {
      skipped++;
      continue;
    }

    // Tag with source_project if not already set
    added.push({
      ...entry,
      source_project: entry.source_project ?? "unknown",
    });
  }

  const mergedEntries = [...localEntries, ...added];
  const projectsList = Array.from(sourceProjects).sort();

  const result: MergeResult = {
    entries_added: added.length,
    entries_skipped: skipped,
    source_projects: projectsList,
    summary: `Merged ${added.length} global entries (${skipped} skipped as duplicates). Sources: ${projectsList.length > 0 ? projectsList.join(", ") : "none"}.`,
  };

  return { entries: mergedEntries, result };
}
