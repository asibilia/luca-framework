/**
 * Serialize a Brain object to BRAIN.md markdown format.
 *
 * Used for the dual-write guarantee: when brain.json is updated,
 * BRAIN.md is regenerated to keep the markdown view in sync.
 *
 * @module memory/brain-serializer
 */
import type { Brain } from "../__schemas/memory.schemas";

/**
 * Serialize a Brain object to BRAIN.md markdown.
 *
 * @param brain - Validated Brain data
 * @returns Markdown string for BRAIN.md
 *
 * @example
 * ```typescript
 * const markdown = serializeBrain(brainData);
 * await Bun.write(".planning/BRAIN.md", markdown);
 * ```
 */
export function serializeBrain(brain: Brain): string {
  const lines: string[] = [];

  lines.push(`# ${brain.project_name} Project Brain`);
  lines.push("");
  lines.push(
    "> Auto-generated from brain.json. Do not edit directly — use the memory bridge.",
  );
  lines.push("");

  // Project Identity
  lines.push("## Project Identity");
  lines.push("");
  if (brain.domain) lines.push(`- **Domain**: ${brain.domain}`);
  if (brain.purpose) lines.push(`- **Purpose**: ${brain.purpose}`);
  lines.push("");

  // Stack
  lines.push("## Stack");
  lines.push("");
  lines.push(`- **Language**: ${brain.stack.language}`);
  if (brain.stack.framework)
    lines.push(`- **Framework**: ${brain.stack.framework}`);
  if (brain.stack.build) lines.push(`- **Build**: ${brain.stack.build}`);
  lines.push(`- **Testing**: ${brain.stack.testing}`);
  if (brain.stack.styling) lines.push(`- **Styling**: ${brain.stack.styling}`);
  lines.push("");

  // Architecture
  if (brain.architecture_patterns) {
    lines.push("## Architecture");
    lines.push("");
    lines.push(brain.architecture_patterns);
    lines.push("");
  }

  // Code Conventions
  if (brain.code_conventions) {
    lines.push("## Code Conventions");
    lines.push("");
    lines.push(brain.code_conventions);
    lines.push("");
  }

  // Development Preferences
  const prefEntries = Object.entries(brain.development_preferences);
  if (prefEntries.length > 0) {
    lines.push("## Development Preferences");
    lines.push("");
    for (const [key, value] of prefEntries) {
      const label = key
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      lines.push(`- **${label}**: ${value}`);
    }
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push(`_Last updated: ${brain.updated_at || new Date().toISOString()}_`);
  lines.push("");

  return lines.join("\n");
}
