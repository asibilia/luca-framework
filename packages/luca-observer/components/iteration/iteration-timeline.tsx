"use client";

import { useState } from "react";

import orderBy from "lodash/orderBy";

import { CONVERGENCE_STATUS_COLORS } from "~/lib/constants";
import type { IterationRecordSnapshot } from "~/lib/types";

/**
 * Scrollable timeline showing each iteration with key metrics
 * and expandable details.
 *
 * Displays iterations newest-first with convergence status badges,
 * error counts, agent info, and duration. Clicking expands to show
 * full error fingerprint lists, artifacts delta, and timestamp.
 *
 * @param iterations - Array of iteration record snapshots
 */
export function IterationTimeline({
  iterations,
}: {
  iterations: IterationRecordSnapshot[];
}) {
  if (iterations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No iteration history
        </p>
      </div>
    );
  }

  // Newest first
  const sorted = orderBy(iterations, "iteration", "desc");

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Iteration Timeline
      </h3>

      <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
        {sorted.map((iter, idx) => (
          <IterationCard
            key={`${iter.tag}-${iter.iteration}-${idx}`}
            iteration={iter}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Single iteration card with expandable details.
 */
function IterationCard({ iteration }: { iteration: IterationRecordSnapshot }) {
  const [expanded, setExpanded] = useState(false);

  const color =
    CONVERGENCE_STATUS_COLORS[iteration.convergence_status] ??
    "muted-foreground";
  const durationSeconds = (iteration.duration_ms / 1000).toFixed(1);
  const deltaLabel =
    iteration.error_delta > 0
      ? `+${iteration.error_delta}`
      : String(iteration.error_delta);

  return (
    <div className="rounded border border-border bg-card transition-colors hover:border-muted-foreground/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left md:gap-3 md:px-4 md:py-3"
      >
        <div className="flex items-center gap-3">
          {/* Iteration number */}
          <span className="font-mono text-sm font-bold text-foreground">
            #{iteration.iteration}
          </span>

          {/* Loop type badge */}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {iteration.loop}
          </span>

          {/* Convergence status badge */}
          <span
            className="rounded px-2 py-0.5 font-mono text-xs font-medium"
            style={{
              color: `var(--color-${color})`,
              backgroundColor: `color-mix(in srgb, var(--color-${color}) 15%, transparent)`,
            }}
          >
            {iteration.convergence_status}
          </span>

          {/* Error count and delta */}
          <span className="font-mono text-xs text-muted-foreground">
            {iteration.error_count} errors
          </span>
          <span
            className="font-mono text-xs font-medium"
            style={{ color: `var(--color-${color})` }}
          >
            ({deltaLabel})
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Agent */}
          <span className="font-mono text-xs text-muted-foreground">
            {iteration.agent_invoked}
          </span>

          {/* Duration */}
          <span className="font-mono text-xs text-muted-foreground">
            {durationSeconds}s
          </span>

          {/* Expand indicator */}
          <span className="font-mono text-xs text-muted-foreground">
            {expanded ? "\u25B2" : "\u25BC"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Metadata */}
            <div className="space-y-1.5">
              <DetailRow label="Tag" value={iteration.tag} />
              <DetailRow label="Phase" value={String(iteration.phase)} />
              <DetailRow
                label="Stale Count"
                value={String(iteration.stale_count)}
              />
              <DetailRow
                label="Artifacts Delta"
                value={String(iteration.artifacts_delta)}
              />
              <DetailRow
                label="Timestamp"
                value={new Date(iteration.timestamp).toLocaleString()}
              />
            </div>

            {/* Error fingerprints */}
            <div className="space-y-2">
              {iteration.permanent_errors.length > 0 && (
                <ErrorFingerprints
                  label="Permanent"
                  color="destructive"
                  errors={iteration.permanent_errors}
                />
              )}
              {iteration.correctable_errors.length > 0 && (
                <ErrorFingerprints
                  label="Correctable"
                  color="warning"
                  errors={iteration.correctable_errors}
                />
              )}
              {iteration.transient_errors.length > 0 && (
                <ErrorFingerprints
                  label="Transient"
                  color="info"
                  errors={iteration.transient_errors}
                />
              )}
              {iteration.permanent_errors.length === 0 &&
                iteration.correctable_errors.length === 0 &&
                iteration.transient_errors.length === 0 && (
                  <p className="font-mono text-xs text-muted-foreground">
                    No classified errors
                  </p>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Simple key-value detail row.
 */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-muted-foreground">{label}:</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

/**
 * Collapsible list of error fingerprints.
 */
function ErrorFingerprints({
  label,
  color,
  errors,
}: {
  label: string;
  color: string;
  errors: string[];
}) {
  return (
    <div>
      <span
        className="font-mono text-xs font-medium"
        style={{ color: `var(--color-${color})` }}
      >
        {label} ({errors.length})
      </span>
      <ul className="mt-1 space-y-0.5">
        {errors.map((err, idx) => (
          <li
            key={`${err}-${idx}`}
            className="truncate font-mono text-xs text-muted-foreground"
            title={err}
          >
            {err}
          </li>
        ))}
      </ul>
    </div>
  );
}
