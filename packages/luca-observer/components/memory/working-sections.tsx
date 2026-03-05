"use client";

import { useState, useMemo } from "react";

import { EmptyState } from "~/components/shared/empty-state";
import { formatSize } from "~/lib/format";

/**
 * A parsed section from WORKING.md.
 */
interface WorkingSection {
  heading: string;
  content: string;
  charCount: number;
  hasContent: boolean;
}

/**
 * Parse WORKING.md content into collapsible sections.
 *
 * Splits on ## headings. Each section tracks content, character count,
 * and whether it has meaningful content for the status badge.
 */
function parseSections(content: string): WorkingSection[] {
  const lines = content.split("\n");
  const sections: WorkingSection[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    const body = currentLines.join("\n").trim();
    sections.push({
      heading: currentHeading,
      content: body,
      charCount: body.length,
      hasContent: body.length > 0,
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
 * Component rendering WORKING.md content with collapsible sections.
 *
 * Parses markdown for section headers and renders each as a
 * collapsible panel with status badge (Active/Empty) and character count.
 * Sections with content are auto-expanded.
 *
 * @param content - Raw WORKING.md markdown content
 */
export function WorkingSections({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <EmptyState
        title="No WORKING.md"
        message="Session memory will appear here during active work."
      />
    );
  }

  const sections = useMemo(() => parseSections(content), [content]);

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          WORKING.md
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          Session Memory
        </p>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {sections.length === 0 ? (
          <div className="px-4 py-3">
            <p className="font-mono text-xs text-muted-foreground">
              No sections found.
            </p>
          </div>
        ) : (
          sections.map((section) => (
            <SectionPanel key={section.heading} section={section} />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Collapsible panel for a single WORKING.md section.
 *
 * Auto-expanded if the section has content.
 */
function SectionPanel({ section }: { section: WorkingSection }) {
  const [expanded, setExpanded] = useState(section.hasContent);

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
          <span className="font-mono text-xs font-medium text-foreground">
            {section.heading}
          </span>
          <span
            className="rounded px-1.5 py-0.5 font-mono text-xs font-medium"
            style={{
              color: section.hasContent
                ? "var(--color-success)"
                : "var(--color-muted-foreground)",
              backgroundColor: section.hasContent
                ? "color-mix(in oklab, var(--color-success) 15%, transparent)"
                : "color-mix(in oklab, var(--color-muted-foreground) 10%, transparent)",
            }}
          >
            {section.hasContent ? "Active" : "Empty"}
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {formatSize(section.charCount)}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-2">
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {section.content || "No content."}
          </pre>
        </div>
      )}
    </div>
  );
}
