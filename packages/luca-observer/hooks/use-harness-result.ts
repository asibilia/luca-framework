"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";
import { z } from "zod";

import { safeJsonParse } from "~/lib/safe-json-parse";
import { tables } from "~/module_bindings";
import { CheckResultSnapshotSchema } from "~/lib/types";

import type { HarnessResultSnapshot } from "~/lib/types";

/**
 * React hook for real-time harness result from SpacetimeDB.
 *
 * Subscribes to the harness_results table (singleton, id=1) and returns
 * the latest verification harness result.
 *
 * @returns Object with result, hasResult flag, and loading state
 */
export function useHarnessResult() {
  const [rows, isLoading] = useTable(tables.harnessResults);

  const { result, hasResult } = useMemo(() => {
    const row = rows[0];
    if (!row) return { result: null, hasResult: false };

    const rawChecks = safeJsonParse<unknown[]>(row.checksJson, []);
    const checks = Array.isArray(rawChecks)
      ? rawChecks
          .map((c) => CheckResultSnapshotSchema.safeParse(c))
          .filter(
            (
              r,
            ): r is z.SafeParseSuccess<
              z.infer<typeof CheckResultSnapshotSchema>
            > => r.success,
          )
          .map((r) => r.data)
      : [];

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
  };
}
