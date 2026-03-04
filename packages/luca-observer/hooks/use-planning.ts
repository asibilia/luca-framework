"use client";

import { z } from "zod";

import { SessionPlanSnapshotSchema } from "~/lib/types";

import { usePollingFetch } from "./use-polling-fetch";

/**
 * API Response schema for /api/planning.
 *
 * Uses snake_case for API compatibility.
 */
const PlanningResponseSchema = z.object({
  plan: SessionPlanSnapshotSchema.nullable().default(null),
  has_plan: z.boolean().default(false),
});

/**
 * React hook for polling session plan from the API.
 *
 * Polls /api/planning at the specified interval to get the current
 * session plan with WSJF scores.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 * @returns Object with plan, hasPlan flag, loading state, and error
 */
export function usePlanning(intervalMs = 15000) {
  const { data, loading, error } = usePollingFetch(
    "/api/planning",
    PlanningResponseSchema,
    intervalMs,
  );

  return {
    plan: data?.plan ?? null,
    hasPlan: data?.has_plan ?? false,
    loading,
    error,
  };
}
