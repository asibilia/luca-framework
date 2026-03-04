"use client";

import { z } from "zod";

import { AgentActivitySnapshotSchema } from "~/lib/types";

import { usePollingFetch } from "./use-polling-fetch";

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
  const { data, loading, error } = usePollingFetch(
    "/api/agents",
    AgentsResponseSchema,
    intervalMs,
  );

  return {
    agents: data?.agents ?? [],
    loading,
    error,
  };
}
