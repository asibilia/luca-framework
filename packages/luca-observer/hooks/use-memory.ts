"use client";

import { z } from "zod";

import { usePollingFetch } from "./use-polling-fetch";

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
  return usePollingFetch("/api/memory", MemoryResponseSchema, intervalMs);
}
