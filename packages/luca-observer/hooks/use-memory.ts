"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

export type MemoryFiles = {
  brain: string;
  memory: string;
  working: string;
  procedures: string;
};

/**
 * React hook for real-time memory files from SpacetimeDB.
 *
 * Subscribes to the memory_files table (singleton, id=1) and returns
 * the latest BRAIN.md, MEMORY.md, and WORKING.md content.
 *
 * @returns Object with data (MemoryFiles), loading state, and error
 */
export function useMemory() {
  const [rows, isLoading] = useTable(tables.memoryFiles);

  const data = useMemo((): MemoryFiles | null => {
    const row = rows[0];
    if (!row) return null;

    return {
      brain: row.brainJson ?? "",
      memory: row.memoryJson ?? "",
      working: row.workingJson ?? "",
      procedures: row.proceduresJson ?? "",
    };
  }, [rows]);

  return { data, loading: isLoading, error: null as string | null };
}
