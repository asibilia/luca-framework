"use client";

import { WorkflowSnapshotSchema } from "~/lib/types";

import { usePollingFetch } from "./use-polling-fetch";

/**
 * React hook for polling workflow state from the API.
 *
 * Polls /api/state every 5 seconds to get the latest STATE.md contents.
 *
 * @param intervalMs - Polling interval in milliseconds (default 5000)
 * @returns Object with data, loading state, and error
 */
export function useWorkflowState(intervalMs = 5000) {
  return usePollingFetch("/api/state", WorkflowSnapshotSchema, intervalMs);
}
