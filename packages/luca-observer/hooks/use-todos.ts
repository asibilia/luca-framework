"use client";

import { useEffect, useState } from "react";

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
 * Hook for reading and parsing todo files.
 *
 * In production, this would call an API endpoint that reads
 * from `.planning/todos/pending/` and `.planning/todos/done/`.
 * For now, returns mock data with the correct structure.
 */
export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Placeholder for future API call:
    // fetch('/api/todos').then(res => res.json()).then(data => setTodos(data));

    // Mock data demonstrating the structure
    const mockTodos: Todo[] = [
      {
        filename: "hook-portability-abstraction.md",
        title: "Hook Portability Abstraction Layer",
        area: "framework/hooks",
        created: "2026-03-01",
        source: "expert-panel-research",
        tier: 2,
        complexity: "COMPLEX",
        state: "pending",
      },
      {
        filename: "cross-session-procedure-replay.md",
        title: "Cross-Session Procedure Replay Engine",
        area: "framework/memory",
        created: "2026-03-01",
        source: "expert-panel-research",
        tier: 3,
        complexity: "COMPLEX",
        state: "pending",
      },
    ];

    setTodos(mockTodos);
    setLoading(false);
  }, []);

  return { todos, loading, error };
}
