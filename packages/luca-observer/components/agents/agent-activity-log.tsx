"use client";

import orderBy from "lodash/orderBy";

import { EventBadge } from "~/components/shared/event-badge";
import { SectionHeader } from "~/components/layout/section-header";
import type { AgentActivitySnapshot } from "~/lib/types";

/**
 * A single event entry from an agent's activity history.
 */
interface AgentEvent {
  agentName: string;
  eventType: string;
  timestamp: string;
  durationMs?: number;
  status?: string;
}

/**
 * Flatten all agent snapshots into a single chronological event list.
 *
 * @param agents - Array of agent activity snapshots
 * @param selectedAgent - Optional filter to show only one agent's events
 * @returns Flattened and sorted event array (newest first)
 */
function flattenEvents(
  agents: AgentActivitySnapshot[],
  selectedAgent?: string,
): AgentEvent[] {
  const filtered = selectedAgent
    ? agents.filter((a) => a.agent_name === selectedAgent)
    : agents;

  const events: AgentEvent[] = [];
  for (const agent of filtered) {
    for (const event of agent.events) {
      events.push({
        agentName: agent.agent_name,
        eventType: event.event_type,
        timestamp: event.timestamp,
        durationMs: event.duration_ms,
        status: event.status,
      });
    }
  }

  return orderBy(events, (e) => new Date(e.timestamp).getTime(), "desc");
}

/**
 * Color for event status values.
 */
function statusColor(status: string): string {
  switch (status) {
    case "passed":
    case "success":
      return "success";
    case "failed":
    case "error":
      return "destructive";
    case "skipped":
      return "muted-foreground";
    default:
      return "info";
  }
}

/**
 * Scrollable chronological log of individual agent events.
 *
 * Shows event type, agent name, timestamp, duration, and status.
 * Events are color-coded by type using EVENT_TYPES constants.
 * Filterable by agent when a selection is made in the scorecard table.
 *
 * @param agents - Array of agent activity snapshots from the API
 * @param selectedAgent - Optional agent filter (from scorecard selection)
 */
export function AgentActivityLog({
  agents,
  selectedAgent,
}: {
  agents: AgentActivitySnapshot[];
  selectedAgent?: string;
}) {
  const events = flattenEvents(agents, selectedAgent);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title={
          selectedAgent ? `Activity Log: ${selectedAgent}` : "Activity Log"
        }
        actions={
          <span className="font-mono text-xs text-muted-foreground">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
        }
      />

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            {selectedAgent
              ? `No events recorded for ${selectedAgent}.`
              : "No agent events recorded yet."}
          </p>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
          <div className="flex flex-col gap-0.5 p-1">
            {events.map((event, idx) => {
              const time = new Date(event.timestamp).toLocaleTimeString();
              return (
                <div
                  key={`${event.agentName}-${event.timestamp}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded border border-border bg-card px-3 py-2 transition-colors hover:border-muted-foreground/30"
                >
                  <div className="flex items-center gap-2">
                    <EventBadge eventType={event.eventType} />
                    <span className="font-mono text-xs font-semibold">
                      {event.agentName}
                    </span>
                    {event.status && (
                      <span
                        className="font-mono text-xs"
                        style={{
                          color: `var(--color-${statusColor(event.status)})`,
                        }}
                      >
                        {event.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {event.durationMs !== undefined && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {event.durationMs}ms
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      {time}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
