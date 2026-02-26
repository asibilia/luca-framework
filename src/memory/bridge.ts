/**
 * High-level CLI bridge for the Luca memory system.
 *
 * Provides convenience subcommands targeted at skill/agent prompts
 * and hook scripts. Wraps existing memory parsers/serializers in
 * shell-friendly commands with JSON output.
 *
 * Subcommands:
 *   read-memory          — Summary index of MEMORY.md entries (compact by default)
 *   read-memory --tags   — Filtered full entries by tags
 *   read-memory --category — Filtered full entries by category
 *   read-memory --milestone — Milestone-scoped recall (scored by proximity + tags)
 *   read-working         — Parsed WORKING.md structure
 *   read-procedures      — Summary index of PROCEDURES.md entries
 *   read-procedures --query — Scored procedure recall
 *   check-context        — Token usage across all memory files
 *   check-compression    — Compression recommendations
 *   append-working       — Append content to a WORKING.md section
 *   clear-working        — Reset WORKING.md to empty state
 *   update-procedure-stats — Update execution stats for a procedure
 *
 * All output is JSON to stdout. Errors go to stderr with exit code 2.
 *
 * Usage:
 *   bun run src/memory/bridge.ts read-memory
 *   bun run src/memory/bridge.ts read-memory --tags=coding,testing --limit=5
 *   bun run src/memory/bridge.ts read-memory --category=pattern --limit=3
 *   bun run src/memory/bridge.ts read-memory --milestone=v1.6.0 --tags=memory,recall --limit=10
 *   bun run src/memory/bridge.ts read-working
 *   bun run src/memory/bridge.ts read-procedures
 *   bun run src/memory/bridge.ts read-procedures --query="implement feature" --tags=api --limit=3
 *   bun run src/memory/bridge.ts check-context
 *   bun run src/memory/bridge.ts check-compression
 *   bun run src/memory/bridge.ts append-working --section=findings --content="Found bug in X"
 *   bun run src/memory/bridge.ts clear-working
 *   bun run src/memory/bridge.ts update-procedure-stats --id=proc-add-api --success=true
 *
 * @module memory/bridge
 */
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
import { estimateTokens } from "./token-estimator.ts";
import { WORKING_MEMORY_SECTIONS } from "./memory.schemas";
import { getArg } from "~/shared/cli-utils";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default paths for memory files. */
const MEMORY_PATH = ".planning/MEMORY.md";
const WORKING_PATH = ".planning/WORKING.md";
const PROCEDURES_PATH = ".planning/PROCEDURES.md";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Print usage information to stderr.
 */
function printUsage(): void {
  console.error(`Usage: bun run src/memory/bridge.ts <subcommand> [options]

Subcommands:
  read-memory            Summary index of MEMORY.md entries (compact)
                         Options: --tags=t1,t2 --category=pattern --limit=N
                                  --milestone=v1.6.0 (scored recall by proximity)
  read-working           Parsed WORKING.md structure
  read-procedures        Summary index of PROCEDURES.md entries
                         Options: --query="text" --tags=t1,t2 --limit=N
  check-context          Token usage across all memory files
  check-compression      Compression recommendations for MEMORY.md
  append-working         Append content to a WORKING.md section
                         Options: --section=name (required) --content="text" (required)
  clear-working          Reset WORKING.md to empty state
  update-procedure-stats Update execution stats for a procedure
                         Options: --id=proc-id (required) --success=true|false (required)`);
}

// ─── Read Commands ──────────────────────────────────────────────────────────

/**
 * Read MEMORY.md entries.
 *
 * Without filters: returns a compact summary index (id, title, category, tags, confidence).
 * With --tags or --category: returns full matching entries.
 * With --milestone: returns milestone-scoped recall (scored by proximity + tag relevance).
 * With --limit: caps the number of entries returned.
 *
 * @param args - CLI arguments (--tags, --category, --milestone, --limit optional)
 */
export async function handleReadMemory(args: string[]): Promise<void> {
  const tagsArg = getArg(args, "tags");
  const categoryArg = getArg(args, "category");
  const milestoneArg = getArg(args, "milestone");
  const limitArg = getArg(args, "limit");
  const limit = limitArg ? parseInt(limitArg, 10) : 0;

  const result = await parseMemoryFile(MEMORY_PATH);

  if (!result.success) {
    // File doesn't exist or can't be parsed — graceful default
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
  // In milestone mode, --tags serves dual purpose:
  //   1. Pre-filters entries to only those matching at least one tag (consistent with standard mode)
  //   2. Boosts matching entries via tag_overlap scoring in scoreMilestoneRecall
  if (milestoneArg) {
    const queryTags = tagsArg ? tagsArg.split(",").map((t) => t.trim()) : [];

    let sourceEntries = result.data;

    // Apply tag filter before scoring (consistent with standard mode behavior)
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
  let entries = result.data;

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

    for (const entry of result.data) {
      categories[entry.category] = (categories[entry.category] ?? 0) + 1;
      totalTokens += entry.token_estimate;
    }

    const summaryEntries = (limit > 0 ? entries : result.data).map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      tags: e.tags,
      confidence: e.confidence,
    }));

    console.log(
      JSON.stringify({
        entries_count: result.data.length,
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
 * Returns parsed sections, total tokens, and lifecycle status.
 * Graceful default when file doesn't exist.
 */
export async function handleReadWorking(): Promise<void> {
  try {
    const file = Bun.file(WORKING_PATH);
    const exists = await file.exists();

    if (!exists) {
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
 * Without --query: returns a compact summary index.
 * With --query (and optional --tags, --limit): returns scored procedure recall.
 *
 * @param args - CLI arguments (--query, --tags, --limit optional)
 */
export async function handleReadProcedures(args: string[]): Promise<void> {
  const queryArg = getArg(args, "query");
  const tagsArg = getArg(args, "tags");
  const limitArg = getArg(args, "limit");
  const limit = limitArg ? parseInt(limitArg, 10) : 5;

  const result = await parseProcedureFile(PROCEDURES_PATH);

  if (!result.success) {
    // File doesn't exist or can't be parsed — graceful default
    console.log(
      JSON.stringify({
        active_count: 0,
        retired_count: 0,
        entries: [],
      }),
    );
    return;
  }

  const allEntries = result.data;

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
 * Parses existing WORKING.md (or creates empty), appends content
 * to the named section, and writes back.
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

  // Parse existing or create empty
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
    const file = Bun.file(WORKING_PATH);
    if (await file.exists()) {
      const markdown = await file.text();
      const result = parseWorkingMemory(markdown);
      if (result.success) {
        wm = result.data;
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

  // Write back
  const markdown = serializeWorkingMemory(updated);
  await Bun.write(WORKING_PATH, markdown);

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

  const markdown = serializeWorkingMemory(cleared);
  await Bun.write(WORKING_PATH, markdown);

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

  const result = await parseProcedureFile(PROCEDURES_PATH);
  if (!result.success) {
    console.error(`Failed to parse PROCEDURES.md: ${result.error}`);
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
