"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Todo item parsed from markdown frontmatter.
 *
 * Matches the shape returned by GET /api/todos.
 * Uses snake_case-compatible field names since this is an API response type.
 */
export interface Todo {
  filename: string;
  title: string;
  area: string;
  created: string;
  source: string;
  tier: number;
  complexity: string;
  priority: string;
  milestone: string;
  state: "pending" | "done" | "completed";
}

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
      const data: Todo[] = await res.json();
      setTodos(data);
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
