"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";
import { z } from "zod";

import { tables } from "~/module_bindings";
import { CheckResultSnapshotSchema } from "~/lib/types";

import type { HarnessResultSnapshot } from "~/lib/types";

/**
 * React hook for real-time harness result from SpacetimeDB.
 *
 * Subscribes to the harness_results table (singleton, id=1) and returns
 * the latest verification harness result. Replaces the polling-based implementation.
 *
 * @returns Object with result, hasResult flag, loading state, and error
 */
export function useHarnessResult() {
  const [rows, isLoading] = useTable(tables.harnessResults);

  const { result, hasResult } = useMemo(() => {
    const row = rows[0];
    if (!row) return { result: null, hasResult: false };

    let checks: z.infer<typeof CheckResultSnapshotSchema>[] = [];
    try {
      const rawChecks = JSON.parse(row.checksJson || "[]");
      if (Array.isArray(rawChecks)) {
        for (const c of rawChecks) {
          const parsed = CheckResultSnapshotSchema.safeParse(c);
          if (parsed.success) {
            checks.push(parsed.data);
          }
        }
      }
    } catch {
      // Ignore malformed JSON
    }

    return {
      result: {
        status: row.passed ? ("passed" as const) : ("failed" as const),
        checks,
        total_errors: Number(row.totalErrors),
        total_warnings: Number(row.totalWarnings),
        duration: 0,
        timestamp: "",
      } satisfies HarnessResultSnapshot,
      hasResult: true,
    };
  }, [rows]);

  return {
    result,
    hasResult,
    loading: isLoading,
    error: null as string | null,
  };
}
