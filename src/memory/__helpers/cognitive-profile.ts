/**
 * Portable cognitive profiles for cross-project knowledge transfer.
 *
 * Exports a project's cognitive state (brain + memory) into a portable
 * format that can be imported into another project. Handles merging
 * with existing data to avoid duplicates.
 *
 * @module memory/cognitive-profile
 */
import { z } from "zod";
import filter from "lodash/filter";
import find from "lodash/find";
import isEmpty from "lodash/isEmpty";

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

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Export a portable cognitive profile from brain content and memory entries.
 *
 * Filters entries to include only high-confidence patterns and decisions,
 * which are the most transferable across projects.
 *
 * @param brain - Parsed brain data
 * @param memoryEntries - All memory entries from MEMORY.md
 * @returns A portable CognitiveProfile
 *
 * @example
 * ```typescript
 * const profile = exportCognitiveProfile(brain, entries);
 * await Bun.write("profile.json", JSON.stringify(profile, null, 2));
 * ```
 */
export function exportCognitiveProfile(
  brain: Brain,
  memoryEntries: MemoryEntry[],
): CognitiveProfile {
  // Include high-confidence patterns and decisions (most transferable)
  const transferable = filter(
    memoryEntries,
    (entry) =>
      entry.confidence === "high" ||
      (entry.confidence === "medium" &&
        (entry.category === "pattern" || entry.category === "decision")),
  );

  // Collect unique domain tags from included entries
  const tagSet = new Set<string>();
  for (const entry of transferable) {
    for (const tag of entry.tags) {
      tagSet.add(tag);
    }
  }

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    source_project: brain.project_name,
    brain,
    entries: transferable,
    domain_tags: Array.from(tagSet).sort(),
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
