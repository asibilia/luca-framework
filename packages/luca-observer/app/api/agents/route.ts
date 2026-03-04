import { NextResponse } from "next/server";

import { queryEvents } from "~/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents -- Read agent activity summary.
 *
 * Aggregates agent activity from in-memory SSE events by filtering
 * for events with an agent_name field. Returns a per-agent summary
 * with invocation counts, durations, and event history.
 *
 * Uses snake_case for API compatibility.
 */
export async function GET() {
  try {
    // Get all events from the in-memory store
    const events = queryEvents();
    const agentEvents = events.filter(
      (e) => e.agent_name && e.agent_name.length > 0,
    );

    // Aggregate by agent name
    const agentMap = new Map<
      string,
      {
        invocation_count: number;
        last_invoked_at: string;
        total_duration_ms: number;
        events: Array<{
          event_type: string;
          timestamp: string;
          duration_ms?: number;
          status?: string;
        }>;
      }
    >();

    for (const event of agentEvents) {
      const name = event.agent_name!;
      const existing = agentMap.get(name) ?? {
        invocation_count: 0,
        last_invoked_at: "",
        total_duration_ms: 0,
        events: [],
      };

      existing.invocation_count += 1;
      existing.total_duration_ms += event.duration_ms ?? 0;

      const ts = event.timestamp ?? new Date(event.timestamp_ms).toISOString();
      if (!existing.last_invoked_at || ts > existing.last_invoked_at) {
        existing.last_invoked_at = ts;
      }

      existing.events.push({
        event_type: event.event_type,
        timestamp: ts,
        duration_ms: event.duration_ms ?? undefined,
        status: event.status ?? undefined,
      });

      agentMap.set(name, existing);
    }

    const agents = Array.from(agentMap.entries()).map(([name, data]) => ({
      agent_name: name,
      ...data,
    }));

    return NextResponse.json({
      agents,
      total_count: agents.length,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_agents" },
      { status: 500 },
    );
  }
}
