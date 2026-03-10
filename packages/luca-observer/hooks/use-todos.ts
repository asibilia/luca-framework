"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

/**
 * Zod schema for a single todo item from the API response.
 *
 * Single source of truth for the Todo type shape. Validates
 * API responses at runtime via safeParse instead of unsafe casting.
 */
const TodoSchema = z.object({
  filename: z.string(),
  title: z.string(),
  area: z.string(),
  created: z.string(),
  source: z.string(),
  tier: z.number(),
  complexity: z.string(),
  priority: z.string(),
  milestone: z.string(),
  state: z.enum(["pending", "done", "completed"]),
});

/**
 * Todo item parsed from markdown frontmatter.
 *
 * Matches the shape returned by GET /api/todos.
 * Uses snake_case-compatible field names since this is an API response type.
 * Inferred from TodoSchema as single source of truth.
 */
export type Todo = z.infer<typeof TodoSchema>;

/**
 * Optional filter parameters for the /api/todos endpoint.
 */
export interface TodoFilters {
  status?: "pending" | "done" | "completed" | "all";
  milestone?: string;
  limit?: number;
}

/**
 * Hook for reading and parsing todo files via the /api/todos endpoint.
 *
 * Fetches from the API route that reads `.planning/todos/{pending,done,completed}/`
 * directories on the server. Supports optional filters for status, milestone,
 * and result limit.
 *
 * @param filters - Optional query parameter filters
 * @returns todos, loading, error, and a refetch function
 */
export function useTodos(filters?: TodoFilters) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.milestone) params.set("milestone", filters.milestone);
      if (filters?.limit) params.set("limit", String(filters.limit));

      const query = params.toString();
      const url = query ? `/api/todos?${query}` : "/api/todos";

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(
          `Failed to fetch todos: ${res.status} ${res.statusText}`,
        );
      }
      const rawData: unknown = await res.json();
      const parseResult = z.array(TodoSchema).safeParse(rawData);
      if (!parseResult.success) {
        setError("Unexpected response format from /api/todos");
        console.error(
          "[useTodos] Invalid response shape:",
          parseResult.error.message,
        );
        setTodos([]);
        return;
      }
      setTodos(parseResult.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error fetching todos";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.milestone, filters?.limit]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  return { todos, loading, error, refetch: fetchTodos };
}
