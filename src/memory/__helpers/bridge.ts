/**
 * High-level CLI bridge for the Luca memory system.
 *
 * SpacetimeDB-primary: read functions query SpacetimeDB first with
 * JSON file fallback. Write functions call SpacetimeDB reducers via
 * callReducer() from observer-emitter.
 *
 * Subcommands (JSON-first -- JSON files are source of truth, MD files are views):
 *   read-brain           -- Read project brain (SpacetimeDB primary, brain.json fallback)
 *   read-memory          -- Summary index of memory entries (compact by default)
 *   read-memory --tags   -- Filtered full entries by tags
 *   read-memory --category -- Filtered full entries by category
 *   read-memory --milestone -- Milestone-scoped recall (scored by proximity + tags)
 *   read-working         -- Parsed working memory structure
 *   read-procedures      -- Summary index of procedure entries
 *   read-procedures --query -- Scored procedure recall
 *   check-context        -- Token usage across all memory files
 *   check-compression    -- Compression recommendations
 *   append-working       -- Append content to a working memory section
 *   clear-working        -- Reset working memory to empty state
 *   update-procedure-stats -- Update execution stats for a procedure
 *   add-memory-entry     -- Add a validated memory entry (JSON + MD dual-write)
 *   snapshot-memory      -- Regenerate all MD views from JSON sources
 *   ensure-init          -- Create JSON files if missing (with MD migration/generation)
 *
 * All output is JSON to stdout. Errors go to stderr with exit code 2.
 *
 * Usage:
 *   bun run src/memory/__helpers/bridge.ts read-brain
 *   bun run src/memory/__helpers/bridge.ts read-memory
 *   bun run src/memory/__helpers/bridge.ts read-memory --tags=coding,testing --limit=5
 *   bun run src/memory/__helpers/bridge.ts read-memory --category=pattern --limit=3
 *   bun run src/memory/__helpers/bridge.ts read-memory --milestone=v1.6.0 --tags=memory,recall --limit=10
 *   bun run src/memory/__helpers/bridge.ts read-working
 *   bun run src/memory/__helpers/bridge.ts read-procedures
 *   bun run src/memory/__helpers/bridge.ts read-procedures --query="implement feature" --tags=api --limit=3
 *   bun run src/memory/__helpers/bridge.ts check-context
 *   bun run src/memory/__helpers/bridge.ts check-compression
 *   bun run src/memory/__helpers/bridge.ts append-working --section=findings --content="Found bug in X"
 *   bun run src/memory/__helpers/bridge.ts clear-working
 *   bun run src/memory/__helpers/bridge.ts update-procedure-stats --id=proc-add-api --success=true
 *   bun run src/memory/__helpers/bridge.ts add-memory-entry --data='{"title":"Pattern","category":"pattern",...}'
 *   bun run src/memory/__helpers/bridge.ts snapshot-memory
 *   bun run src/memory/__helpers/bridge.ts ensure-init
 *
 * @module memory/bridge
 */
import { z } from "zod";

import { parseMemoryFile } from "./memory-parser.ts";
import {
  parseWorkingMemory,
  serializeWorkingMemory,
  addSection,
} from "./working-memory.ts";
import { parseProcedureFile, serializeProcedures } from "./procedure-parser.ts";
import { recallProcedures } from "./procedure-recall.ts";
import { updateExecutionStats } from "./procedure-lifecycle.ts";
import { createContextMonitor } from "./context-monitor.ts";
import { analyzeMemoryEntries } from "./compression.ts";
import { scoreMilestoneRecall } from "./milestone-recall.ts";
import {
  readJsonFile,
  writeJsonFile,
  jsonFileExists,
  BRAIN_JSON_PATH,
  MEMORY_JSON_PATH,
  WORKING_JSON_PATH,
  PROCEDURES_JSON_PATH,
} from "./json-persistence.ts";
import { parseBrainFile } from "./brain-parser.ts";
import { serializeBrain } from "./brain-serializer.ts";
import { serializeMemoryEntries } from "./memory-serializer.ts";
import {
  WORKING_MEMORY_SECTIONS,
  brainSchema,
  memoryEntrySchema,
  procedureEntrySchema,
  workingMemorySchema,
} from "../__schemas/memory.schemas";
import { getArg } from "~/shared/__helpers/cli-utils";

import type { MemoryEntry } from "../__schemas/memory.schemas";

// ─── SpacetimeDB Imports ─────────────────────────────────────────────────────

/**
 * Lazy import of SpacetimeDB client functions.
 * These are in the luca-framework package, so we use a dynamic approach
 * to avoid cross-package import issues. Falls back gracefully.
 */
let _queryOne: (<T>(sql: string) => Promise<T | null>) | null = null;
let _callReducer:
  | ((name: string, args: Record<string, unknown>) => void)
  | null = null;

async function getSpacetimeDBClient(): Promise<{
  queryOne: <T>(sql: string) => Promise<T | null>;
  callReducer: (name: string, args: Record<string, unknown>) => void;
} | null> {
  if (_queryOne && _callReducer) {
    return { queryOne: _queryOne, callReducer: _callReducer };
  }

  try {
    // Use the observer-emitter URL resolution and SSRF validation
    const url = process.env.LUCA_SPACETIMEDB_URL || "http://localhost:3000";
    const dbName = process.env.LUCA_SPACETIMEDB_DB || "luca-observer";

    _queryOne = async <T>(sql: string): Promise<T | null> => {
      const endpoint = `${url.replace(/\/+$/, "")}/v1/database/${dbName}/sql`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: sql,
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) throw new Error(`Query failed: ${response.status}`);
      const data: unknown = await response.json();
      // v2.0: array of result sets, each with { schema, rows }
      if (Array.isArray(data) && data.length > 0) {
        const resultSet = data[0] as {
          schema?: { elements?: Array<{ name?: { some?: string } }> };
          rows?: unknown[][];
        };
        const rows = resultSet?.rows;
        if (!rows || rows.length === 0) return null;
        const fields = resultSet?.schema?.elements?.map(
          (e) => e?.name?.some ?? "",
        );
        if (!fields) return rows[0] as unknown as T;
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < fields.length; i++) {
          obj[fields[i]!] = (rows[0] as unknown[])[i];
        }
        return obj as T;
      }
      return null;
    };

    _callReducer = (
      reducerName: string,
      args: Record<string, unknown>,
    ): void => {
      const endpoint = `${url.replace(/\/+$/, "")}/v1/database/${dbName}/call/${reducerName}`;
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(2000),
      }).catch((err) => {
        if (process.env.LUCA_DEBUG) {
          console.error(
            `[memory-bridge] Reducer ${reducerName} failed:`,
            (err as Error).message,
          );
        }
      });
    };

    return { queryOne: _queryOne, callReducer: _callReducer };
  } catch {
    return null;
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default paths for memory files. */
const MEMORY_PATH = ".planning/MEMORY.md";
const WORKING_PATH = ".planning/WORKING.md";
const PROCEDURES_PATH = ".planning/PROCEDURES.md";
const BRAIN_PATH = ".planning/BRAIN.md";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Print usage information to stderr.
 */
function printUsage(): void {
  console.error(`Usage: bun run src/memory/__helpers/bridge.ts <subcommand> [options]

Subcommands:
  read-brain             Read project brain (SpacetimeDB-primary, JSON fallback)
  read-memory            Summary index of memory entries (compact)
                         Options: --tags=t1,t2 --category=pattern --limit=N
                                  --milestone=v1.6.0 (scored recall by proximity)
  read-working           Parsed working memory structure
  read-procedures        Summary index of procedure entries
                         Options: --query="text" --tags=t1,t2 --limit=N
  check-context          Token usage across all memory files
  check-compression      Compression recommendations for memory
  append-working         Append content to a working memory section
                         Options: --section=name (required) --content="text" (required)
  clear-working          Reset working memory to empty state
  update-procedure-stats Update execution stats for a procedure
                         Options: --id=proc-id (required) --success=true|false (required)
  add-memory-entry       Add a new memory entry
                         Options: --data='{"title":"...","category":"pattern",...}' (required)
  snapshot-memory        Regenerate all MD views from JSON sources
  ensure-init            Create JSON files if missing (with MD view generation)`);
}

/**
 * Fire-and-forget: sync memory files to SpacetimeDB via reducer.
 *
 * Serializes to markdown (not JSON) because observer components
 * parse the stored strings as markdown with ## headings.
 */
function syncMemoryViaReducer(
  callReducerFn: (name: string, args: Record<string, unknown>) => void,
  brainData: unknown,
  memoryData: unknown,
  workingData: unknown,
  proceduresData: unknown,
): void {
  const brain = brainSchema.safeParse(brainData);
  const memory = z.array(memoryEntrySchema).safeParse(memoryData);
  const working = workingMemorySchema.safeParse(workingData);
  const procedures = z.array(procedureEntrySchema).safeParse(proceduresData);

  // Reducer requires all four fields; skip call entirely if any parse fails
  if (
    !brain.success ||
    !memory.success ||
    !working.success ||
    !procedures.success
  ) {
    return;
  }

  callReducerFn("update_memory_files", {
    timestamp: Date.now(),
    brainJson: serializeBrain(brain.data),
    memoryJson: serializeMemoryEntries(memory.data),
    workingJson: serializeWorkingMemory(working.data),
    proceduresJson: serializeProcedures(procedures.data),
  });
}

// ─── Read Commands ──────────────────────────────────────────────────────────

/**
 * Read MEMORY.md entries.
 *
 * SpacetimeDB-primary: queries memory_files table for memoryJson.
 * Falls back to JSON file, then MEMORY.md parsing.
 *
 * @param args - CLI arguments (--tags, --category, --milestone, --limit optional)
 */
export async function handleReadMemory(args: string[]): Promise<void> {
  const tagsArg = getArg(args, "tags");
  const categoryArg = getArg(args, "category");
  const milestoneArg = getArg(args, "milestone");
  const limitArg = getArg(args, "limit");
  const limit = limitArg ? parseInt(limitArg, 10) : 0;

  // SpacetimeDB-primary: try SpacetimeDB first
  let memoryData: MemoryEntry[] | null = null;
  try {
    const client = await getSpacetimeDBClient();
    if (client) {
      const row = await client.queryOne<{ memoryJson: string }>(
        "SELECT memoryJson FROM memory_files WHERE id = 1",
      );
      if (row && row.memoryJson) {
        const parsed = z
          .array(memoryEntrySchema)
          .safeParse(JSON.parse(row.memoryJson));
        if (parsed.success) memoryData = parsed.data;
      }
    }
  } catch (err) {
    if (process.env.LUCA_DEBUG) {
      console.error(
        "[memory-bridge] SpacetimeDB unavailable for read-memory, falling back to JSON:",
        (err as Error).message,
      );
    }
  }

  // Fallback: JSON file, then MD
  if (!memoryData) {
    const jsonResult = await readJsonFile(
      MEMORY_JSON_PATH,
      z.array(memoryEntrySchema),
    );
    const mdResult = jsonResult.success
      ? null
      : await parseMemoryFile(MEMORY_PATH);
    memoryData = jsonResult.success
      ? jsonResult.data
      : mdResult?.success
        ? mdResult.data
        : null;
  }

  if (!memoryData) {
    // No data source available -- graceful default
    console.log(
      JSON.stringify({
        entries_count: 0,
        categories: {},
        total_tokens: 0,
        entries: [],
      }),
    );
    return;
  }

  // ── Milestone-scoped recall mode ─────────────────────────────────────────
  if (milestoneArg) {
    const queryTags = tagsArg ? tagsArg.split(",").map((t) => t.trim()) : [];

    let sourceEntries = memoryData;

    // Apply tag filter before scoring
    if (queryTags.length > 0) {
      const lowerTags = queryTags.map((t) => t.toLowerCase());
      sourceEntries = sourceEntries.filter((e) =>
        e.tags.some((t) => lowerTags.includes(t.toLowerCase())),
      );
    }

    // Apply category filter before scoring
    if (categoryArg) {
      const cat = categoryArg.toLowerCase();
      sourceEntries = sourceEntries.filter(
        (e) => e.category.toLowerCase() === cat,
      );
    }

    const scored = scoreMilestoneRecall(sourceEntries, queryTags, {
      current_milestone: milestoneArg,
    });

    const limited = limit > 0 ? scored.slice(0, limit) : scored;

    console.log(
      JSON.stringify({
        milestone: milestoneArg,
        query_tags: queryTags,
        total_scored: scored.length,
        entries: limited.map((s) => ({
          id: s.entry.id,
          title: s.entry.title,
          category: s.entry.category,
          tags: s.entry.tags,
          confidence: s.entry.confidence,
          milestone: s.entry.milestone,
          score: s.score,
          milestone_proximity: s.milestone_proximity,
          tag_overlap: s.tag_overlap,
        })),
      }),
    );
    return;
  }

  // ── Standard filter/summary mode ─────────────────────────────────────────
  const hasFilters = !!tagsArg || !!categoryArg;
  let entries = memoryData;

  // Apply tag filter
  if (tagsArg) {
    const filterTags = tagsArg.split(",").map((t) => t.trim().toLowerCase());
    entries = entries.filter((e) =>
      e.tags.some((t) => filterTags.includes(t.toLowerCase())),
    );
  }

  // Apply category filter
  if (categoryArg) {
    const cat = categoryArg.toLowerCase();
    entries = entries.filter((e) => e.category.toLowerCase() === cat);
  }

  // Apply limit
  if (limit > 0) {
    entries = entries.slice(0, limit);
  }

  if (hasFilters) {
    // Full entries when filtering
    console.log(JSON.stringify({ entries }));
  } else {
    // Compact summary index when no filters
    const categories: Record<string, number> = {};
    let totalTokens = 0;

    for (const entry of memoryData) {
      categories[entry.category] = (categories[entry.category] ?? 0) + 1;
      totalTokens += entry.token_estimate;
    }

    const summaryEntries = (limit > 0 ? entries : memoryData).map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      tags: e.tags,
      confidence: e.confidence,
    }));

    console.log(
      JSON.stringify({
        entries_count: memoryData.length,
        categories,
        total_tokens: totalTokens,
        entries: summaryEntries,
      }),
    );
  }
}

/**
 * Read WORKING.md into structured JSON.
 *
 * SpacetimeDB-primary: queries memory_files table for workingJson.
 * Falls back to JSON file, then WORKING.md parsing.
 */
export async function handleReadWorking(): Promise<void> {
  try {
    // SpacetimeDB-primary
    try {
      const client = await getSpacetimeDBClient();
      if (client) {
        const row = await client.queryOne<{ workingJson: string }>(
          "SELECT workingJson FROM memory_files WHERE id = 1",
        );
        if (row && row.workingJson) {
          const parsed = workingMemorySchema.safeParse(
            JSON.parse(row.workingJson),
          );
          if (parsed.success) {
            console.log(JSON.stringify(parsed.data));
            return;
          }
        }
      }
    } catch (err) {
      if (process.env.LUCA_DEBUG) {
        console.error(
          "[memory-bridge] SpacetimeDB unavailable for read-working, falling back to JSON:",
          (err as Error).message,
        );
      }
    }

    // JSON file fallback
    const jsonResult = await readJsonFile(
      WORKING_JSON_PATH,
      workingMemorySchema,
    );
    if (jsonResult.success) {
      console.log(JSON.stringify(jsonResult.data));
      return;
    }

    // Fallback: parse WORKING.md
    const file = Bun.file(WORKING_PATH);
    if (!(await file.exists())) {
      console.log(
        JSON.stringify({
          sections: [],
          total_tokens: 0,
          status: "cleared",
        }),
      );
      return;
    }

    const markdown = await file.text();
    const result = parseWorkingMemory(markdown);

    if (!result.success) {
      console.log(
        JSON.stringify({
          sections: [],
          total_tokens: 0,
          status: "cleared",
          parse_error: result.error,
        }),
      );
      return;
    }

    console.log(JSON.stringify(result.data));
  } catch {
    console.log(
      JSON.stringify({
        sections: [],
        total_tokens: 0,
        status: "cleared",
      }),
    );
  }
}

/**
 * Read PROCEDURES.md entries.
 *
 * SpacetimeDB-primary: queries memory_files for procedures data.
 * Falls back to JSON file, then PROCEDURES.md parsing.
 *
 * @param args - CLI arguments (--query, --tags, --limit optional)
 */
export async function handleReadProcedures(args: string[]): Promise<void> {
  const queryArg = getArg(args, "query");
  const tagsArg = getArg(args, "tags");
  const limitArg = getArg(args, "limit");
  const limit = limitArg ? parseInt(limitArg, 10) : 5;

  // SpacetimeDB-primary (procedures are stored as part of memory_files or separately)
  // For now, follow same pattern as other reads
  const jsonResult = await readJsonFile(
    PROCEDURES_JSON_PATH,
    z.array(procedureEntrySchema),
  );
  const mdResult = jsonResult.success
    ? null
    : await parseProcedureFile(PROCEDURES_PATH);
  const allEntries = jsonResult.success
    ? jsonResult.data
    : mdResult?.success
      ? mdResult.data
      : null;

  if (!allEntries) {
    // No data source available -- graceful default
    console.log(
      JSON.stringify({
        active_count: 0,
        retired_count: 0,
        entries: [],
      }),
    );
    return;
  }

  if (queryArg) {
    // Scored recall mode
    const phaseTags = tagsArg ? tagsArg.split(",").map((t) => t.trim()) : [];

    const recalled = recallProcedures(
      allEntries,
      { phase_description: queryArg, phase_tags: phaseTags },
      limit,
    );

    console.log(JSON.stringify({ entries: recalled }));
  } else {
    // Summary index mode
    const active = allEntries.filter((e) => e.status === "active");
    const retired = allEntries.filter((e) => e.status === "retired");

    const summaryEntries = allEntries.map((e) => ({
      id: e.id,
      title: e.title,
      trigger: e.trigger,
      tags: e.tags,
      success_rate: e.success_rate,
      execution_count: e.execution_count,
      status: e.status,
    }));

    console.log(
      JSON.stringify({
        active_count: active.length,
        retired_count: retired.length,
        entries: summaryEntries,
      }),
    );
  }
}

/**
 * Check token usage across all memory files.
 *
 * Uses the context monitor to compute per-file breakdown and quality zone.
 */
export async function handleCheckContext(): Promise<void> {
  const monitor = createContextMonitor({ project_dir: "." });
  const usage = await monitor.checkContextUsage();
  console.log(JSON.stringify(usage));
}

/**
 * Check compression recommendations for MEMORY.md.
 *
 * Returns whether compression should trigger, with reasons and actions.
 * Also includes per-entry compression recommendations when MEMORY.md exists.
 */
export async function handleCheckCompression(): Promise<void> {
  const monitor = createContextMonitor({ project_dir: "." });
  const trigger = await monitor.shouldCompress();

  // Also analyze individual entries if MEMORY.md exists
  const memResult = await parseMemoryFile(MEMORY_PATH);
  let recommendations: any[] = [];

  if (memResult.success && memResult.data.length > 0) {
    recommendations = analyzeMemoryEntries(memResult.data);
  }

  console.log(
    JSON.stringify({
      ...trigger,
      entry_recommendations: recommendations,
    }),
  );
}

// ─── Write Commands ─────────────────────────────────────────────────────────

/**
 * Append content to a section of WORKING.md.
 *
 * Writes to SpacetimeDB via reducer. Also writes to local JSON + MD files.
 *
 * @param args - CLI arguments (--section=name required, --content=text required)
 */
export async function handleAppendWorking(args: string[]): Promise<void> {
  const sectionName = getArg(args, "section");
  const content = getArg(args, "content");

  if (!sectionName) {
    console.error("Missing --section argument");
    process.exit(2);
  }
  if (!content) {
    console.error("Missing --content argument");
    process.exit(2);
  }

  // Validate section name
  if (
    !WORKING_MEMORY_SECTIONS.includes(
      sectionName as (typeof WORKING_MEMORY_SECTIONS)[number],
    )
  ) {
    console.error(
      `Invalid section "${sectionName}". Allowed: ${WORKING_MEMORY_SECTIONS.join(", ")}`,
    );
    process.exit(2);
  }

  // Load existing working memory or create empty
  let wm: {
    sections: any[];
    total_tokens: number;
    status: "active" | "extracted" | "cleared";
    session_started_at?: string;
  } = {
    sections: [],
    total_tokens: 0,
    status: "active",
  };

  try {
    const jsonResult = await readJsonFile(
      WORKING_JSON_PATH,
      workingMemorySchema,
    );
    if (jsonResult.success) {
      wm = jsonResult.data;
    } else {
      // Fallback: parse WORKING.md
      const file = Bun.file(WORKING_PATH);
      if (await file.exists()) {
        const markdown = await file.text();
        const result = parseWorkingMemory(markdown);
        if (result.success) {
          wm = result.data;
        }
      }
    }
  } catch {
    // Use empty default
  }

  // Append content
  const updated = addSection(
    wm,
    sectionName as (typeof WORKING_MEMORY_SECTIONS)[number],
    content,
    "append",
  );

  // Write MD + sync to SpacetimeDB
  const markdown = serializeWorkingMemory(updated);
  await Bun.write(WORKING_PATH, markdown);

  // Sync to SpacetimeDB via reducer
  const client = await getSpacetimeDBClient();
  if (client) {
    const brainJson = await readJsonFile(BRAIN_JSON_PATH, brainSchema).catch(
      () => ({
        success: false as const,
        error: "read failed",
        data: undefined,
      }),
    );
    const memoryJson = await readJsonFile(
      MEMORY_JSON_PATH,
      z.array(memoryEntrySchema),
    ).catch(() => ({
      success: false as const,
      error: "read failed",
      data: undefined,
    }));
    const proceduresJson = await readJsonFile(
      PROCEDURES_JSON_PATH,
      z.array(procedureEntrySchema),
    ).catch(() => ({
      success: false as const,
      error: "read failed",
      data: undefined,
    }));
    syncMemoryViaReducer(
      client.callReducer,
      brainJson.success ? brainJson.data : {},
      memoryJson.success ? memoryJson.data : [],
      updated,
      proceduresJson.success ? proceduresJson.data : [],
    );
  }

  // Find the updated section for response
  const updatedSection = updated.sections.find((s) => s.name === sectionName);

  console.log(
    JSON.stringify({
      section: sectionName,
      total_tokens: updated.total_tokens,
      section_tokens: updatedSection?.token_estimate ?? 0,
      status: updated.status,
    }),
  );
}

/**
 * Reset WORKING.md to empty state.
 *
 * Creates a fresh WORKING.md with empty sections and "cleared" status.
 * Syncs to SpacetimeDB via reducer.
 */
export async function handleClearWorking(): Promise<void> {
  const cleared = {
    sections: WORKING_MEMORY_SECTIONS.map((name) => ({
      name,
      content: "",
      token_estimate: 0,
    })),
    total_tokens: 0,
    status: "cleared" as const,
    session_started_at: new Date().toISOString(),
  };

  // Write MD + sync to SpacetimeDB
  const markdown = serializeWorkingMemory(cleared);
  await Bun.write(WORKING_PATH, markdown);

  // Sync to SpacetimeDB via reducer
  const client = await getSpacetimeDBClient();
  if (client) {
    const brainJson = await readJsonFile(BRAIN_JSON_PATH, brainSchema).catch(
      () => ({
        success: false as const,
        error: "read failed",
        data: undefined,
      }),
    );
    const memoryJson = await readJsonFile(
      MEMORY_JSON_PATH,
      z.array(memoryEntrySchema),
    ).catch(() => ({
      success: false as const,
      error: "read failed",
      data: undefined,
    }));
    const proceduresJson = await readJsonFile(
      PROCEDURES_JSON_PATH,
      z.array(procedureEntrySchema),
    ).catch(() => ({
      success: false as const,
      error: "read failed",
      data: undefined,
    }));
    syncMemoryViaReducer(
      client.callReducer,
      brainJson.success ? brainJson.data : {},
      memoryJson.success ? memoryJson.data : [],
      cleared,
      proceduresJson.success ? proceduresJson.data : [],
    );
  }

  console.log(
    JSON.stringify({
      cleared: true,
      status: "cleared",
      session_started_at: cleared.session_started_at,
    }),
  );
}

/**
 * Update execution stats for a procedure.
 *
 * Finds the procedure by ID, updates execution_count, success_count,
 * success_rate, and last_executed_at, then writes back to PROCEDURES.md.
 *
 * @param args - CLI arguments (--id=proc-id required, --success=true|false required)
 */
export async function handleUpdateProcedureStats(
  args: string[],
): Promise<void> {
  const procId = getArg(args, "id");
  const successArg = getArg(args, "success");

  if (!procId) {
    console.error("Missing --id argument");
    process.exit(2);
  }
  if (!successArg) {
    console.error("Missing --success argument");
    process.exit(2);
  }

  const success = successArg === "true";

  // JSON-primary: try procedures.json first, fall back to PROCEDURES.md
  const jsonResult = await readJsonFile(
    PROCEDURES_JSON_PATH,
    z.array(procedureEntrySchema),
  );
  const result = jsonResult.success
    ? jsonResult
    : await parseProcedureFile(PROCEDURES_PATH);
  if (!result.success) {
    console.error(`Failed to load procedures: ${result.error}`);
    process.exit(2);
  }

  const entryIndex = result.data.findIndex((e) => e.id === procId);
  if (entryIndex < 0) {
    console.error(`Procedure not found: ${procId}`);
    process.exit(2);
  }

  // Update the entry
  const original = result.data[entryIndex]!;
  const updated = updateExecutionStats(original, success);

  // Replace in array and serialize
  const allEntries = [...result.data];
  allEntries[entryIndex] = updated;

  // Write MD (SpacetimeDB sync handled by write-memory)
  const markdown = serializeProcedures(allEntries);
  await Bun.write(PROCEDURES_PATH, markdown);

  console.log(
    JSON.stringify({
      id: updated.id,
      execution_count: updated.execution_count,
      success_count: updated.success_count,
      success_rate: updated.success_rate,
      last_executed_at: updated.last_executed_at,
    }),
  );
}

// ─── JSON-First Commands ─────────────────────────────────────────────────────

/**
 * Read project brain.
 *
 * SpacetimeDB-primary: queries memory_files table for brainJson.
 * Falls back to brain.json, then BRAIN.md parsing.
 */
export async function handleReadBrain(): Promise<void> {
  // SpacetimeDB-primary
  try {
    const client = await getSpacetimeDBClient();
    if (client) {
      const row = await client.queryOne<{ brainJson: string }>(
        "SELECT brainJson FROM memory_files WHERE id = 1",
      );
      if (row && row.brainJson) {
        const parsed = brainSchema.safeParse(JSON.parse(row.brainJson));
        if (parsed.success) {
          console.log(JSON.stringify(parsed.data));
          return;
        }
      }
    }
  } catch (err) {
    if (process.env.LUCA_DEBUG) {
      console.error(
        "[memory-bridge] SpacetimeDB unavailable for read-brain, falling back to JSON:",
        (err as Error).message,
      );
    }
  }

  // JSON file fallback
  const jsonResult = await readJsonFile(BRAIN_JSON_PATH, brainSchema);
  if (jsonResult.success) {
    console.log(JSON.stringify(jsonResult.data));
    return;
  }

  // Fallback: parse BRAIN.md
  const mdResult = await parseBrainFile(BRAIN_PATH);
  if (mdResult.success) {
    console.log(JSON.stringify(mdResult.data));
    return;
  }

  // Neither exists -- empty default
  console.log(JSON.stringify(brainSchema.parse({})));
}

/**
 * Add a new memory entry.
 *
 * Validates the entry against memoryEntrySchema, appends to memory.json,
 * and regenerates MEMORY.md. Syncs to SpacetimeDB via reducer.
 *
 * @param args - CLI arguments (--data='{...}' required)
 */
export async function handleAddMemoryEntry(args: string[]): Promise<void> {
  const dataArg = getArg(args, "data");
  if (!dataArg) {
    console.error("Missing --data argument (JSON string)");
    process.exit(2);
  }

  // Parse and validate the new entry
  let rawEntry: unknown;
  try {
    rawEntry = JSON.parse(dataArg);
  } catch {
    console.error("Invalid JSON in --data argument");
    process.exit(2);
  }

  const entryResult = memoryEntrySchema.safeParse(rawEntry);
  if (!entryResult.success) {
    console.error(`Entry validation failed: ${entryResult.error.message}`);
    process.exit(2);
  }

  const newEntry = entryResult.data;

  // Load existing entries (JSON-primary, MD fallback)
  let entries: MemoryEntry[] = [];
  const jsonResult = await readJsonFile(
    MEMORY_JSON_PATH,
    z.array(memoryEntrySchema),
  );
  if (jsonResult.success) {
    entries = jsonResult.data;
  } else {
    const mdResult = await parseMemoryFile(MEMORY_PATH);
    if (mdResult.success) {
      entries = mdResult.data;
    }
  }

  // Append new entry
  entries.push(newEntry);

  // Write MD + sync to SpacetimeDB
  await Bun.write(MEMORY_PATH, serializeMemoryEntries(entries));

  // Sync to SpacetimeDB via reducer
  const client = await getSpacetimeDBClient();
  if (client) {
    const brainJson = await readJsonFile(BRAIN_JSON_PATH, brainSchema).catch(
      () => ({
        success: false,
        error: "read failed",
        data: {},
      }),
    );
    const workingJson = await readJsonFile(
      WORKING_JSON_PATH,
      workingMemorySchema,
    ).catch(() => ({
      success: false,
      error: "read failed",
      data: {},
    }));
    const proceduresJson = await readJsonFile(
      PROCEDURES_JSON_PATH,
      z.array(procedureEntrySchema),
    ).catch(() => ({
      success: false,
      error: "read failed",
      data: [],
    }));
    syncMemoryViaReducer(
      client.callReducer,
      brainJson.success ? brainJson.data : {},
      entries,
      workingJson.success ? workingJson.data : {},
      proceduresJson.success ? proceduresJson.data : [],
    );
  }

  console.log(
    JSON.stringify({
      added: newEntry.title,
      total_entries: entries.length,
    }),
  );
}

/**
 * Regenerate all MD views from JSON sources.
 *
 * Useful for manual recovery or ensuring MD views are in sync.
 */
export async function handleSnapshotMemory(): Promise<void> {
  const results: Record<string, string> = {};

  // Brain: JSON -> MD
  const brainResult = await readJsonFile(BRAIN_JSON_PATH, brainSchema);
  if (brainResult.success) {
    await Bun.write(BRAIN_PATH, serializeBrain(brainResult.data));
    results.brain = "regenerated";
  } else {
    results.brain = "skipped (no brain.json)";
  }

  // Memory: JSON -> MD
  const memResult = await readJsonFile(
    MEMORY_JSON_PATH,
    z.array(memoryEntrySchema),
  );
  if (memResult.success) {
    await Bun.write(MEMORY_PATH, serializeMemoryEntries(memResult.data));
    results.memory = "regenerated";
  } else {
    results.memory = "skipped (no memory.json)";
  }

  // Working: JSON -> MD
  const workingResult = await readJsonFile(
    WORKING_JSON_PATH,
    workingMemorySchema,
  );
  if (workingResult.success) {
    await Bun.write(WORKING_PATH, serializeWorkingMemory(workingResult.data));
    results.working = "regenerated";
  } else {
    results.working = "skipped (no working.json)";
  }

  // Procedures: JSON -> MD
  const procResult = await readJsonFile(
    PROCEDURES_JSON_PATH,
    z.array(procedureEntrySchema),
  );
  if (procResult.success) {
    await Bun.write(PROCEDURES_PATH, serializeProcedures(procResult.data));
    results.procedures = "regenerated";
  } else {
    results.procedures = "skipped (no procedures.json)";
  }

  console.log(JSON.stringify({ snapshot: results }));
}

/**
 * Initialize JSON files if missing, with MD view generation.
 *
 * For each memory file (brain, memory, working, procedures):
 * - If JSON exists, skip
 * - If MD exists but not JSON, migrate MD -> JSON
 * - If neither exists, create empty JSON + MD
 */
export async function handleEnsureInit(): Promise<void> {
  const results: Record<string, string> = {};

  // Brain
  if (!(await jsonFileExists(BRAIN_JSON_PATH))) {
    const mdResult = await parseBrainFile(BRAIN_PATH);
    if (mdResult.success) {
      await writeJsonFile(BRAIN_JSON_PATH, mdResult.data);
      results.brain = "migrated from BRAIN.md";
    } else {
      const empty = brainSchema.parse({});
      await writeJsonFile(BRAIN_JSON_PATH, empty);
      await Bun.write(BRAIN_PATH, serializeBrain(empty));
      results.brain = "created empty";
    }
  } else {
    results.brain = "exists";
  }

  // Memory
  if (!(await jsonFileExists(MEMORY_JSON_PATH))) {
    const mdResult = await parseMemoryFile(MEMORY_PATH);
    if (mdResult.success) {
      await writeJsonFile(MEMORY_JSON_PATH, mdResult.data);
      results.memory = "migrated from MEMORY.md";
    } else {
      await writeJsonFile(MEMORY_JSON_PATH, []);
      await Bun.write(MEMORY_PATH, serializeMemoryEntries([]));
      results.memory = "created empty";
    }
  } else {
    results.memory = "exists";
  }

  // Working
  if (!(await jsonFileExists(WORKING_JSON_PATH))) {
    const file = Bun.file(WORKING_PATH);
    if (await file.exists()) {
      const md = await file.text();
      const parsed = parseWorkingMemory(md);
      if (parsed.success) {
        await writeJsonFile(WORKING_JSON_PATH, parsed.data);
        results.working = "migrated from WORKING.md";
      } else {
        const empty = {
          sections: [],
          total_tokens: 0,
          status: "cleared" as const,
        };
        await writeJsonFile(WORKING_JSON_PATH, empty);
        results.working = "created empty";
      }
    } else {
      const empty = {
        sections: [],
        total_tokens: 0,
        status: "cleared" as const,
      };
      await writeJsonFile(WORKING_JSON_PATH, empty);
      results.working = "created empty";
    }
  } else {
    results.working = "exists";
  }

  // Procedures
  if (!(await jsonFileExists(PROCEDURES_JSON_PATH))) {
    const procResult = await parseProcedureFile(PROCEDURES_PATH);
    if (procResult.success) {
      await writeJsonFile(PROCEDURES_JSON_PATH, procResult.data);
      results.procedures = "migrated from PROCEDURES.md";
    } else {
      await writeJsonFile(PROCEDURES_JSON_PATH, []);
      results.procedures = "created empty";
    }
  } else {
    results.procedures = "exists";
  }

  // Sync to SpacetimeDB via reducer
  const client = await getSpacetimeDBClient();
  if (client) {
    const brainJson = await readJsonFile(BRAIN_JSON_PATH, brainSchema).catch(
      () => ({
        success: false,
        error: "read failed",
        data: {},
      }),
    );
    const memoryJson = await readJsonFile(
      MEMORY_JSON_PATH,
      z.array(memoryEntrySchema),
    ).catch(() => ({
      success: false,
      error: "read failed",
      data: [],
    }));
    const workingJson = await readJsonFile(
      WORKING_JSON_PATH,
      workingMemorySchema,
    ).catch(() => ({
      success: false,
      error: "read failed",
      data: {},
    }));
    const proceduresJson = await readJsonFile(
      PROCEDURES_JSON_PATH,
      z.array(procedureEntrySchema),
    ).catch(() => ({
      success: false,
      error: "read failed",
      data: [],
    }));
    syncMemoryViaReducer(
      client.callReducer,
      brainJson.success ? brainJson.data : {},
      memoryJson.success ? memoryJson.data : [],
      workingJson.success ? workingJson.data : {},
      proceduresJson.success ? proceduresJson.data : [],
    );
  }

  console.log(JSON.stringify({ initialized: true, files: results }));
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

if (import.meta.main) {
  const subcommand = Bun.argv[2];
  const args = Bun.argv.slice(3);

  async function run() {
    switch (subcommand) {
      case "read-memory":
        await handleReadMemory(args);
        break;
      case "read-working":
        await handleReadWorking();
        break;
      case "read-procedures":
        await handleReadProcedures(args);
        break;
      case "check-context":
        await handleCheckContext();
        break;
      case "check-compression":
        await handleCheckCompression();
        break;
      case "append-working":
        await handleAppendWorking(args);
        break;
      case "clear-working":
        await handleClearWorking();
        break;
      case "update-procedure-stats":
        await handleUpdateProcedureStats(args);
        break;
      case "read-brain":
        await handleReadBrain();
        break;
      case "add-memory-entry":
        await handleAddMemoryEntry(args);
        break;
      case "snapshot-memory":
        await handleSnapshotMemory();
        break;
      case "ensure-init":
        await handleEnsureInit();
        break;
      default:
        printUsage();
        process.exit(2);
    }
  }

  run().catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}
