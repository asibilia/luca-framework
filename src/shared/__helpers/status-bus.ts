import { z } from "zod";

import { StatusBusSchema } from "../__schemas/status-bus.schemas";
import type { StatusBusInput } from "../__schemas/status-bus.schemas";

const BUS_PATH = ".planning/.statusline.json";

/**
 * Write status bus data to .planning/.statusline.json.
 * Merges partial data with existing bus state.
 * Uses atomic write (tmp + rename) to prevent corruption.
 *
 * @param data - Partial status bus data to merge
 * @param busPath - Path to the status bus file (default: .planning/.statusline.json)
 */
export const writeStatusBus = async (
  data: Partial<StatusBusInput>,
  busPath: string = BUS_PATH,
): Promise<void> => {
  try {
    // Read existing bus data for merge
    let existing: Record<string, unknown> = {};
    try {
      const file = Bun.file(busPath);
      if (await file.exists()) {
        existing = await file.json();
      }
    } catch {
      // Ignore read errors — start fresh
    }

    const merged = {
      ...existing,
      ...data,
      updated_at: new Date().toISOString(),
    };

    const parseResult = StatusBusSchema.safeParse(merged);
    if (!parseResult.success) return;

    const content = JSON.stringify(parseResult.data, null, 2) + "\n";
    const tmpPath = `${busPath}.tmp`;
    await Bun.write(tmpPath, content);
    const { rename } = await import("node:fs/promises");
    await rename(tmpPath, busPath);
  } catch {
    // Status bus writes must never fail visibly
  }
};

/**
 * Read and parse the status bus file.
 * Returns null on any failure (missing, corrupt, stale).
 *
 * @param busPath - Path to the status bus file (default: .planning/.statusline.json)
 * @param maxAgeMs - Maximum age in milliseconds before data is considered stale (default: 60000)
 * @returns Parsed status bus data or null if unavailable/stale
 */
export const readStatusBus = async (
  busPath: string = BUS_PATH,
  maxAgeMs: number = 60_000,
): Promise<z.infer<typeof StatusBusSchema> | null> => {
  try {
    const file = Bun.file(busPath);
    if (!(await file.exists())) return null;

    const raw = await file.json();
    const parseResult = StatusBusSchema.safeParse(raw);
    if (!parseResult.success) return null;

    // Check staleness
    if (parseResult.data.updated_at) {
      const age = Date.now() - new Date(parseResult.data.updated_at).getTime();
      if (age > maxAgeMs) return null;
    }

    return parseResult.data;
  } catch {
    return null;
  }
};

/**
 * Remove the status bus file. Idempotent.
 *
 * @param busPath - Path to the status bus file (default: .planning/.statusline.json)
 */
export const clearStatusBus = async (
  busPath: string = BUS_PATH,
): Promise<void> => {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(busPath);
  } catch {
    // Ignore if file doesn't exist
  }
};
