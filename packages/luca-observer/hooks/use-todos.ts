"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Todo item parsed from markdown frontmatter.
 */
export interface Todo {
  filename: string;
  title: string;
  area: string;
  created: string;
  source: string;
  tier: number;
  complexity: string;
  state: "pending" | "done";
}

/**
 * Hook for reading and parsing todo files via the /api/todos endpoint.
 *
 * Fetches from the API route that reads `.planning/todos/pending/`
 * and `.planning/todos/done/` directories on the server.
 *
 * @returns todos, loading, error, and a refetch function.
 */
export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/todos");
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
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  return { todos, loading, error, refetch: fetchTodos };
}
