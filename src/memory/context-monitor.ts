import type { QualityZone } from "../planner/types.ts";
import type { ContextUsageResult, CompressionTrigger } from "./types.ts";
import { contextUsageResultSchema, compressionTriggerSchema } from "./types.ts";
import { estimateFileTokens } from "./token-estimator.ts";
import { join } from "node:path";

/** Default context file paths relative to project root. */
const DEFAULT_CONTEXT_FILES = {
  brain: ".planning/BRAIN.md",
  memory: ".planning/MEMORY.md",
  working: ".planning/WORKING.md",
  state: ".planning/STATE.md",
} as const;

/**
 * Default total context budget in tokens.
 *
 * Represents the usable portion of a ~200K context window,
 * accounting for system prompts, tool definitions, and other overhead.
 */
const DEFAULT_CONTEXT_BUDGET = 50000;

/** Percentage of budget MEMORY.md can occupy before compression triggers. */
const MEMORY_COMPRESSION_THRESHOLD = 50;

/** Percentage of budget WORKING.md can occupy before compression triggers. */
const WORKING_COMPRESSION_THRESHOLD = 15;

/**
 * Configuration for the context monitor factory.
 */
interface ContextMonitorConfig {
  /** Project directory path (default: ".") */
  project_dir?: string;
  /** Total context budget in tokens (default: 50000) */
  context_budget?: number;
  /** Zone boundary percentages */
  zone_boundaries?: {
    /** End of peak zone percentage (default: 30) */
    peak_end: number;
    /** End of good zone percentage (default: 50) */
    good_end: number;
    /** End of degrading zone percentage (default: 70) */
    degrading_end: number;
  };
}

/**
 * Per-file breakdown entry returned by getBreakdown.
 */
interface ContextBreakdownEntry {
  /** File identifier (brain, memory, working, state) */
  name: string;
  /** File path relative to project root */
  file: string;
  /** Estimated token count */
  tokens: number;
  /** Whether the file exists */
  exists: boolean;
}

/**
 * Create a context monitor for tracking memory file usage.
 *
 * Returns an object with methods to check context usage, get per-file
 * breakdowns, and determine compression needs. Designed for use by
 * both hooks (shell via CLI) and skills (TypeScript API).
 *
 * Factory function pattern (no classes) per codebase conventions.
 *
 * @param config - Optional configuration overrides
 * @returns Context monitor object with checkContextUsage, getBreakdown, shouldCompress
 *
 * @example
 * ```typescript
 * const monitor = createContextMonitor({ project_dir: "." });
 * const usage = await monitor.checkContextUsage();
 * console.log(`${usage.usage_percent}% context used (zone: ${usage.zone})`);
 *
 * const compress = await monitor.shouldCompress();
 * if (compress.should_compress) {
 *   console.log("Compression recommended:", compress.triggers);
 * }
 * ```
 */
export function createContextMonitor(config?: ContextMonitorConfig) {
  const projectDir = config?.project_dir ?? ".";
  const budget = config?.context_budget ?? DEFAULT_CONTEXT_BUDGET;
  const zones = config?.zone_boundaries ?? {
    peak_end: 30,
    good_end: 50,
    degrading_end: 70,
  };

  /**
   * Map usage percentage to a quality zone.
   *
   * @param usagePercent - Usage percentage (0-100+)
   * @returns Quality zone label
   */
  const mapToZone = (usagePercent: number): QualityZone => {
    if (usagePercent <= zones.peak_end) return "peak";
    if (usagePercent <= zones.good_end) return "good";
    if (usagePercent <= zones.degrading_end) return "degrading";
    return "stop";
  };

  /**
   * Read token estimates for all context files.
   *
   * @returns Array of per-file results with token counts and existence flags
   */
  const readAllFiles = async () => {
    const files = Object.entries(DEFAULT_CONTEXT_FILES);
    const results: Array<{
      name: string;
      file: string;
      tokens: number;
      exists: boolean;
    }> = [];

    for (const [name, relativePath] of files) {
      const fullPath = join(projectDir, relativePath);
      const estimate = await estimateFileTokens(fullPath);

      if (estimate.success) {
        results.push({
          name,
          file: relativePath,
          tokens: estimate.data.tokens,
          exists: true,
        });
      } else {
        results.push({
          name,
          file: relativePath,
          tokens: 0,
          exists: false,
        });
      }
    }

    return results;
  };

  return {
    /**
     * Check context usage across all memory files.
     *
     * Reads each context file, estimates tokens, calculates usage
     * percentage against the budget, and maps to a quality zone.
     *
     * @returns Usage result with percentage, zone, and per-file breakdown
     */
    checkContextUsage: async (): Promise<ContextUsageResult> => {
      const fileResults = await readAllFiles();
      const totalTokens = fileResults.reduce((sum, f) => sum + f.tokens, 0);
      const usagePercent = (totalTokens / budget) * 100;
      const zone = mapToZone(usagePercent);

      const breakdown = fileResults.map((f) => ({
        file: f.file,
        tokens: f.tokens,
        percent_of_budget: Math.round((f.tokens / budget) * 100 * 100) / 100,
        exists: f.exists,
      }));

      // Internal construction — .parse() validates shape, data is computed (not external input)
      return contextUsageResultSchema.parse({
        total_tokens: totalTokens,
        budget_tokens: budget,
        usage_percent: Math.round(usagePercent * 100) / 100,
        zone,
        breakdown,
        timestamp: new Date().toISOString(),
      });
    },

    /**
     * Get per-file token breakdown.
     *
     * @returns Array of per-file breakdown entries
     */
    getBreakdown: async (): Promise<ContextBreakdownEntry[]> => {
      return readAllFiles();
    },

    /**
     * Determine whether compression should be triggered.
     *
     * Returns true when:
     * - MEMORY.md exceeds 50% of total budget (primary trigger)
     * - Total context usage is in "degrading" or "stop" zone
     * - WORKING.md exceeds 15% of total budget
     *
     * @returns Compression trigger assessment with reasons and actions
     */
    shouldCompress: async (): Promise<CompressionTrigger> => {
      const fileResults = await readAllFiles();
      const totalTokens = fileResults.reduce((sum, f) => sum + f.tokens, 0);
      const usagePercent = (totalTokens / budget) * 100;
      const zone = mapToZone(usagePercent);

      const triggers: string[] = [];
      const actions: string[] = [];

      // Check MEMORY.md threshold
      const memoryFile = fileResults.find((f) => f.name === "memory");
      if (memoryFile && memoryFile.exists) {
        const memoryPercent = (memoryFile.tokens / budget) * 100;
        if (memoryPercent > MEMORY_COMPRESSION_THRESHOLD) {
          triggers.push(
            `MEMORY.md uses ${Math.round(memoryPercent)}% of budget (threshold: ${MEMORY_COMPRESSION_THRESHOLD}%)`,
          );
          actions.push(
            "Run memory compression to archive or summarize old entries in MEMORY.md",
          );
        }
      }

      // Check total usage zone
      if (zone === "degrading" || zone === "stop") {
        triggers.push(
          `Total context usage is in "${zone}" zone (${Math.round(usagePercent)}%)`,
        );
        actions.push(
          "Consider starting a new session or running /compact to free context space",
        );
      }

      // Check WORKING.md threshold
      const workingFile = fileResults.find((f) => f.name === "working");
      if (workingFile && workingFile.exists) {
        const workingPercent = (workingFile.tokens / budget) * 100;
        if (workingPercent > WORKING_COMPRESSION_THRESHOLD) {
          triggers.push(
            `WORKING.md uses ${Math.round(workingPercent)}% of budget (threshold: ${WORKING_COMPRESSION_THRESHOLD}%)`,
          );
          actions.push(
            "Summarize or clear sections in WORKING.md to reduce session memory",
          );
        }
      }

      // Internal construction — .parse() validates shape, data is computed (not external input)
      return compressionTriggerSchema.parse({
        should_compress: triggers.length > 0,
        triggers,
        recommended_actions: actions,
      });
    },
  };
}

/**
 * CLI entry point for the context monitor.
 *
 * Outputs JSON usage report to stdout. Supports `--project-dir=<path>`
 * argument for specifying the project directory.
 *
 * @example
 * ```sh
 * bun run src/memory/context-monitor.ts --project-dir=.
 * ```
 */
if (import.meta.main) {
  const projectDir =
    process.argv.find((a) => a.startsWith("--project-dir="))?.split("=")[1] ??
    ".";
  const monitor = createContextMonitor({ project_dir: projectDir });
  const usage = await monitor.checkContextUsage();
  console.log(JSON.stringify(usage, null, 2));
  process.exit(0);
}
