"use client";

import { EmptyState } from "~/components/shared/empty-state";
import { EventBadge } from "~/components/shared/event-badge";
import { JsonViewer } from "~/components/shared/json-viewer";
import { SectionHeader } from "~/components/layout/section-header";
import type { StoredEvent } from "~/lib/types";

/**
 * Live event feed showing recent events with details.
 *
 * Renders events in reverse chronological order with expandable
 * JSON payload viewer.
 */
export function RecentEvents({
  events,
  onClear,
}: {
  events: StoredEvent[];
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Live Event Feed"
        actions={
          <button
            type="button"
            onClick={onClear}
            className="rounded border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Clear
          </button>
        }
      />

      {events.length === 0 ? (
        <EmptyState message="No events yet. Start a Luca workflow to see events stream here in real-time via SpacetimeDB." />
      ) : (
        <div className="flex flex-col gap-1">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: StoredEvent }) {
  const time = new Date(event.timestamp_ms).toLocaleTimeString();

  return (
    <div className="group rounded border border-border bg-card p-3 transition-colors hover:border-muted-foreground/30">
      <div className="flex flex-wrap items-start justify-between gap-2 md:gap-3">
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          <EventBadge eventType={event.event_type} />
          {event.agent_name && (
            <span className="font-mono text-xs text-muted-foreground">
              {event.agent_name}
            </span>
          )}
          {event.tool_name && (
            <span className="font-mono text-xs text-accent/70">
              {event.tool_name}
            </span>
          )}
          {event.file_path && (
            <span className="max-w-xs truncate font-mono text-xs text-muted-foreground">
              {event.file_path}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {event.duration_ms !== undefined && (
            <span className="font-mono text-xs text-muted-foreground">
              {event.duration_ms}ms
            </span>
          )}
          <span className="font-mono text-xs text-muted-foreground">
            {time}
          </span>
          <span className="font-mono text-xs text-muted-foreground/50">
            #{event.id}
          </span>
        </div>
      </div>

      {event.payload && Object.keys(event.payload).length > 0 && (
        <div className="mt-2">
          <JsonViewer data={event.payload} />
        </div>
      )}
    </div>
  );
}
