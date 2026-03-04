"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

/**
 * API Response schema for /api/memory.
 *
 * Uses snake_case for API compatibility.
 */
const MemoryResponseSchema = z.object({
  brain: z.string().default(""),
  memory: z.string().default(""),
  working: z.string().default(""),
});

export type MemoryFiles = z.infer<typeof MemoryResponseSchema>;

/**
 * React hook for polling memory files from the API.
 *
 * Polls /api/memory at the specified interval to get the latest
 * BRAIN.md, MEMORY.md, and WORKING.md content.
 *
 * @param intervalMs - Polling interval in milliseconds (default 10000)
 * @returns Object with data (MemoryFiles), loading state, and error
 */
export function useMemory(intervalMs = 10000) {
  const [data, setData] = useState<MemoryFiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMemory = useCallback(async () => {
    try {
      const res = await fetch("/api/memory");
      if (!res.ok) throw new Error("Failed to fetch memory");
      const json = await res.json();
      const parsed = MemoryResponseSchema.safeParse(json);
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
    fetchMemory();
    const interval = setInterval(fetchMemory, intervalMs);
    return () => clearInterval(interval);
  }, [fetchMemory, intervalMs]);

  return { data, loading, error };
}
