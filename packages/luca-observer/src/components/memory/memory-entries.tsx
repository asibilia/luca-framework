"use client";

import { useState, useMemo } from "react";

/**
 * Known memory categories with display metadata.
 */
const CATEGORIES: Record<string, { label: string; color: string }> = {
  patterns: { label: "Patterns", color: "success" },
  decisions: { label: "Decisions", color: "info" },
  pitfalls: { label: "Pitfalls", color: "warning" },
  preferences: { label: "Preferences", color: "accent" },
};

/**
 * A parsed section from MEMORY.md.
 */
interface MemorySection {
  category: string;
  label: string;
  color: string;
  content: string;
  entryCount: number;
}

/**
 * Parse MEMORY.md content into categorized sections.
 *
 * Splits on ## headings, matches known categories, and counts
 * entries (lines starting with - or *) within each section.
 */
function parseSections(content: string): MemorySection[] {
  const lines = content.split("\n");
  const sections: MemorySection[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    const key = currentHeading.toLowerCase().trim();
    const categoryKey = Object.keys(CATEGORIES).find((k) => key.includes(k));
    const resolved = categoryKey ? CATEGORIES[categoryKey] : undefined;
    const label = resolved?.label ?? currentHeading;
    const color = resolved?.color ?? "muted-foreground";

    const body = currentLines.join("\n").trim();
    const entryCount = currentLines.filter((l) => /^\s*[-*]\s+/.test(l)).length;

    sections.push({
      category: categoryKey ?? key,
      label,
      color,
      content: body,
      entryCount: Math.max(entryCount, body ? 1 : 0),
    });
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentHeading = line.replace(/^#+\s*/, "");
      currentLines = [];
    } else if (currentHeading) {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

/**
 * Component rendering MEMORY.md content organized by category.
 *
 * Parses markdown to identify category headers (Patterns, Decisions,
 * Pitfalls, Preferences) and renders each as a collapsible section
 * with entry counts and color-coded badges.
 *
 * @param content - Raw MEMORY.md markdown content
 */
export function MemoryEntries({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="font-mono text-sm font-bold text-muted-foreground">
          No MEMORY.md
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          Long-term learnings will appear here.
        </p>
      </div>
    );
  }

  const sections = useMemo(() => parseSections(content), [content]);
  const totalEntries = sections.reduce((sum, s) => sum + s.entryCount, 0);

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            MEMORY.md
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            Long-term Learning
          </p>
        </div>
        <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
        </span>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {sections.length === 0 ? (
          <div className="px-4 py-3">
            <p className="font-mono text-xs text-muted-foreground">
              No categorized sections found.
            </p>
          </div>
        ) : (
          sections.map((section) => (
            <CategorySection key={section.category} section={section} />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Collapsible section for a single memory category.
 */
function CategorySection({ section }: { section: MemorySection }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {expanded ? "\u25BC" : "\u25B6"}
          </span>
          <span
            className="rounded px-2 py-0.5 font-mono text-xs font-medium"
            style={{
              color: `var(--color-${section.color})`,
              backgroundColor: `color-mix(in srgb, var(--color-${section.color}) 15%, transparent)`,
            }}
          >
            {section.label}
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {section.entryCount}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-2">
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {section.content || "No entries."}
          </pre>
        </div>
      )}
    </div>
  );
}
