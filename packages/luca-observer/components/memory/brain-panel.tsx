"use client";

import { EmptyState } from "~/components/shared/empty-state";

/**
 * Panel rendering BRAIN.md content with section-aware formatting.
 *
 * Displays the project identity file with styled section headers,
 * key-value pair formatting, and mono-font rendering.
 *
 * @param content - Raw BRAIN.md markdown content
 */
export function BrainPanel({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <EmptyState
        title="No BRAIN.md"
        message="Create a BRAIN.md file to define project identity."
      />
    );
  }

  const lines = content.split("\n");

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          BRAIN.md
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          Project Identity
        </p>
      </div>
      <div className="max-h-[28rem] overflow-y-auto px-4 py-3">
        <div className="space-y-1">
          {lines.map((line, i) => (
            <BrainLine key={i} line={line} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Render a single line from BRAIN.md with formatting.
 *
 * - `# heading` and `## heading` lines render as bold labels
 * - `Key: Value` lines render with dimmed key and bright value
 * - All other lines render as plain mono text
 */
function BrainLine({ line }: { line: string }) {
  // Top-level heading
  if (line.startsWith("# ")) {
    return (
      <p className="mt-2 font-mono text-sm font-bold text-foreground">
        {line.replace(/^#+\s*/, "")}
      </p>
    );
  }

  // Section heading
  if (line.startsWith("## ")) {
    return (
      <p className="mt-3 border-b border-border pb-1 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {line.replace(/^#+\s*/, "")}
      </p>
    );
  }

  // Sub-section heading
  if (line.startsWith("### ")) {
    return (
      <p className="mt-2 font-mono text-xs font-semibold text-foreground">
        {line.replace(/^#+\s*/, "")}
      </p>
    );
  }

  // Key-value pair (e.g., "Project: Luca")
  const kvMatch = line.match(/^[-*]?\s*\*?\*?([^:*]+)\*?\*?:\s*(.+)/);
  const kvKey = kvMatch?.[1];
  const kvValue = kvMatch?.[2];
  if (kvKey && kvValue) {
    return (
      <div className="flex gap-2 font-mono text-xs">
        <span className="shrink-0 text-muted-foreground">{kvKey.trim()}:</span>
        <span className="text-foreground">{kvValue.trim()}</span>
      </div>
    );
  }

  // Empty line
  if (!line.trim()) {
    return <div className="h-1" />;
  }

  // Plain text
  return <p className="font-mono text-xs text-muted-foreground">{line}</p>;
}
