/**
 * Serialize memory entries to MEMORY.md markdown format.
 *
 * Used for the dual-write guarantee: when memory.json is updated,
 * MEMORY.md is regenerated to keep the markdown view in sync.
 *
 * @module memory/memory-serializer
 */
import type { MemoryEntry } from "../__schemas/memory.schemas";

/**
 * Serialize an array of MemoryEntry objects to MEMORY.md markdown.
 *
 * Groups entries by category (patterns, decisions, pitfalls, preferences)
 * and formats each with the standard MEMORY.md entry structure.
 *
 * @param entries - Array of validated MemoryEntry objects
 * @returns Markdown string for MEMORY.md
 *
 * @example
 * ```typescript
 * const markdown = serializeMemoryEntries(entries);
 * await Bun.write(".planning/MEMORY.md", markdown);
 * ```
 */
export function serializeMemoryEntries(entries: MemoryEntry[]): string {
  const lines: string[] = [];

  lines.push("# Project Memory");
  lines.push("");
  lines.push(
    "> Auto-generated from memory.json. Do not edit directly — use the memory bridge.",
  );
  lines.push("");

  const categories = ["pattern", "decision", "pitfall", "preference"] as const;
  const categoryLabels: Record<string, string> = {
    pattern: "Patterns",
    decision: "Decisions",
    pitfall: "Pitfalls",
    preference: "Preferences",
  };

  for (const category of categories) {
    const categoryEntries = entries.filter((e) => e.category === category);
    const label = categoryLabels[category] ?? category;

    lines.push(`## ${label}`);
    lines.push("");

    if (categoryEntries.length === 0) {
      lines.push(`<!-- No ${label.toLowerCase()} captured yet -->`);
      lines.push("");
      continue;
    }

    for (const entry of categoryEntries) {
      lines.push(serializeEntry(entry));
      lines.push("");
    }
  }

  // Statistics
  lines.push("---");
  lines.push("");
  lines.push("_Memory Statistics_");
  lines.push("");

  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.category] = (counts[entry.category] ?? 0) + 1;
  }

  lines.push(`- Total patterns: ${counts["pattern"] ?? 0}`);
  lines.push(`- Total decisions: ${counts["decision"] ?? 0}`);
  lines.push(`- Total pitfalls: ${counts["pitfall"] ?? 0}`);
  lines.push(`- Total preferences: ${counts["preference"] ?? 0}`);
  lines.push(`- Last updated: ${new Date().toISOString()}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Serialize a single MemoryEntry to markdown format.
 */
function serializeEntry(entry: MemoryEntry): string {
  const lines: string[] = [];

  if (entry.category === "decision") {
    lines.push(
      `### ${entry.added_at ? entry.added_at.slice(0, 10) : "Unknown"} - ${entry.title}`,
    );
  } else {
    lines.push(`#### ${entry.title}`);
  }

  lines.push("");
  lines.push(entry.content);

  // Metadata
  if (entry.tags.length > 0) {
    lines.push(`- **Tags**: ${entry.tags.join(", ")}`);
  }
  lines.push(`- **Agent**: ${entry.agent}`);
  lines.push(`- **Confidence**: ${capitalize(entry.confidence)}`);
  if (entry.milestone) {
    lines.push(`- **Milestone**: ${entry.milestone}`);
  }
  lines.push(`- **Added**: ${entry.added_at}`);

  return lines.join("\n");
}

/**
 * Capitalize the first letter of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
