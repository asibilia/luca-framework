"use client";

import { useEffect, useState, useCallback } from "react";

import type { WorkflowSnapshot } from "~/lib/types";
import { WorkflowSnapshotSchema } from "~/lib/types";

/**
 * React hook for polling workflow state from the API.
 *
 * Polls /api/state every 5 seconds to get the latest STATE.md contents.
 *
 * @param intervalMs - Polling interval in milliseconds (default 5000)
 * @returns Object with data, loading state, and error
 */
export function useWorkflowState(intervalMs = 5000) {
  const [data, setData] = useState<WorkflowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("Failed to fetch state");
      const json = await res.json();
      const parsed = WorkflowSnapshotSchema.safeParse(json);
      if (parsed.success) {
        setData(parsed.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, intervalMs);
    return () => clearInterval(interval);
  }, [fetchState, intervalMs]);

  return { data, loading, error };
}
