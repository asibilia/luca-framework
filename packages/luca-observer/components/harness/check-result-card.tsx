"use client";

import { useState } from "react";

import type { CheckResultSnapshot } from "~/lib/types";

import { ParsedErrorList } from "./parsed-error-list";

/**
 * Card showing a single harness check result.
 *
 * Displays check name, status badge, error/warning counts,
 * duration, and expandable error list + raw output.
 *
 * @param check - The check result snapshot to display
 */
export function CheckResultCard({ check }: { check: CheckResultSnapshot }) {
  const [showOutput, setShowOutput] = useState(false);

  const statusConfig: Record<string, { label: string; color: string }> = {
    passed: { label: "Passed", color: "success" },
    failed: { label: "Failed", color: "destructive" },
    skipped: { label: "Skipped", color: "muted-foreground" },
    timeout: { label: "Timeout", color: "warning" },
  };

  const defaultConfig = { label: "Skipped", color: "muted-foreground" };
  const config = statusConfig[check.status] ?? defaultConfig;
  const durationSeconds = (check.duration / 1000).toFixed(1);

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-foreground">
            {check.name}
          </span>
          <span
            className="rounded px-2 py-0.5 font-mono text-xs font-medium"
            style={{
              color: `var(--color-${config.color})`,
              backgroundColor: `color-mix(in oklab, var(--color-${config.color}) 15%, transparent)`,
            }}
          >
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {check.errors.length > 0 && (
            <span
              className="font-mono text-xs"
              style={{ color: "var(--color-destructive)" }}
            >
              {check.errors.length} error
              {check.errors.length !== 1 ? "s" : ""}
            </span>
          )}
          {check.warnings.length > 0 && (
            <span
              className="font-mono text-xs"
              style={{ color: "var(--color-warning)" }}
            >
              {check.warnings.length} warning
              {check.warnings.length !== 1 ? "s" : ""}
            </span>
          )}
          <span className="font-mono text-xs text-muted-foreground">
            {durationSeconds}s
          </span>
        </div>
      </div>

      {check.errors.length > 0 && (
        <div className="border-b border-border px-4 py-2">
          <ParsedErrorList errors={check.errors} />
        </div>
      )}

      {check.warnings.length > 0 && (
        <div className="border-b border-border px-4 py-2">
          <ParsedErrorList errors={check.warnings} />
        </div>
      )}

      {check.raw_output && (
        <div className="px-4 py-2">
          <button
            type="button"
            onClick={() => setShowOutput(!showOutput)}
            className="font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            {showOutput ? "Hide" : "Show"} raw output
          </button>
          {showOutput && (
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
              {check.raw_output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
