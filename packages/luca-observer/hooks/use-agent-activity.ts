"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

import type { AgentActivitySnapshot } from "~/lib/types";
import { AgentActivitySnapshotSchema } from "~/lib/types";

/**
 * API Response schema for /api/agents.
 *
 * Uses snake_case for API compatibility.
 */
const AgentsResponseSchema = z.object({
  agents: z.array(AgentActivitySnapshotSchema).default([]),
  total_count: z.number().default(0),
});

/**
 * React hook for polling agent activity from the API.
 *
 * Polls /api/agents at the specified interval to get the latest
 * agent activity summary derived from SSE events.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 * @returns Object with agents array, loading state, and error
 */
export function useAgentActivity(intervalMs = 15000) {
  const [agents, setAgents] = useState<AgentActivitySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      const json = await res.json();
      const parsed = AgentsResponseSchema.safeParse(json);
      if (parsed.success) {
        setAgents(parsed.data.agents);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, intervalMs);
    return () => clearInterval(interval);
  }, [fetchAgents, intervalMs]);

  return { agents, loading, error };
}
