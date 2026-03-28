/**
 * Progressive Disclosure Executor Mode.
 *
 * Wraps DAG execution with zone-adaptive structured summaries that degrade
 * based on context budget zones. Downstream steps receive appropriately sized
 * context from upstream steps without consuming excessive context budget.
 *
 * Context zone values match the existing contextZoneSchema from hooks:
 *   "peak" (0-30%), "good" (30-50%), "degrading" (50-70%), "stop" (70%+)
 *
 * Degradation policy:
 *   - "peak"/"good" -> full summary (intent, decisions, artifacts, outputPointers)
 *   - "degrading"    -> decisions-only (drop artifacts and outputPointers)
 *   - "stop"         -> minimal (keep only stepId and status)
 *
 * @see .planning/phases/222-anti-skip-infrastructure/01-CONTEXT.md — Decision #3
 * @see .planning/phases/222-anti-skip-infrastructure/01-PREMORTEM.md — Constraint #3
 */

import { z } from "zod";

import type {
  WorkflowDAG,
  WorkflowAdapter,
  ExecutionResult,
  StepResult,
} from "../__schemas/workflow.schemas";
import { executeDAG } from "./dag-executor";
import type { ExecuteDAGOptions } from "./dag-executor";
import { topologicalSort } from "./dag-sorter";

// ─── Context Zone (local definition matching hooks contextZoneSchema) ────────

/**
 * Context zones matching the quality degradation curve from CLAUDE.md.
 *
 * These values intentionally mirror the contextZoneSchema defined in
 * src/hooks/__schemas/hook.schemas.ts. Defined locally to avoid a T3->T1
 * tier violation (hooks is T3 Build, workflow is T1 Core).
 *
 * Values: "peak" | "good" | "degrading" | "stop"
 * The "stop" zone maps to what CLAUDE.md calls "POOR" (>70% usage).
 */
export const CONTEXT_ZONES = ["peak", "good", "degrading", "stop"] as const;
export type ContextZone = (typeof CONTEXT_ZONES)[number];

// ─── Step Summary Schema ─────────────────────────────────────────────────────

/**
 * Structured summary of a completed step's execution.
 *
 * Produced after each wave completes and degraded based on the current
 * context zone before injection into downstream step context.
 */
export const StepSummarySchema = z.object({
  /** Step ID */
  stepId: z.string(),
  /** One-sentence intent */
  intent: z.string().default(""),
  /** Key decisions made during execution */
  decisions: z.array(z.string()).default([]),
  /** File paths written or modified */
  artifacts: z.array(z.string()).default([]),
  /** Pointers to outputs (not full output content) */
  outputPointers: z.array(z.string()).default([]),
  /** Step pass/fail status */
  status: z.enum(["completed", "failed", "skipped"]),
});

export type StepSummary = z.infer<typeof StepSummarySchema>;

// ─── Progressive Executor Config Schema ──────────────────────────────────────

/**
 * Configuration for progressive execution behavior.
 *
 * When `contextMode` is provided, it overrides zone-based degradation
 * (testing override per CONTEXT.md Decision #3).
 */
export const ProgressiveExecutorConfigSchema = z.object({
  /** Override context mode (bypasses zone-based degradation) */
  contextMode: z
    .enum(["full", "summary", "decisions-only", "minimal"])
    .optional(),
  /**
   * Zone boundaries as context usage percentages.
   * Maps to existing ContextZone values from the quality degradation curve.
   */
  zoneBoundaries: z
    .object({
      /** 0 to peakEnd% -> "peak" zone */
      peakEnd: z.number().default(30),
      /** peakEnd to goodEnd% -> "good" zone */
      goodEnd: z.number().default(50),
      /** goodEnd to degradingEnd% -> "degrading" zone, above -> "stop" */
      degradingEnd: z.number().default(70),
    })
    .default({ peakEnd: 30, goodEnd: 50, degradingEnd: 70 }),
});

export type ProgressiveExecutorConfig = z.infer<
  typeof ProgressiveExecutorConfigSchema
>;

// ─── Zone Resolution ─────────────────────────────────────────────────────────

/**
 * Map a context usage percentage to a context zone.
 *
 * Uses the quality degradation curve from CLAUDE.md:
 *   0-30%  -> "peak"  (thorough, comprehensive)
 *   30-50% -> "good"  (confident, solid work)
 *   50-70% -> "degrading" (efficiency mode begins)
 *   70%+   -> "stop"  (rushed, minimal)
 *
 * @param usagePercent - Current context usage as a percentage (0-100)
 * @param boundaries - Optional custom zone boundaries
 * @returns The resolved ContextZone value
 *
 * @example
 * ```typescript
 * resolveContextZone(25) // -> "peak"
 * resolveContextZone(40) // -> "good"
 * resolveContextZone(60) // -> "degrading"
 * resolveContextZone(80) // -> "stop"
 * ```
 */
export function resolveContextZone(
  usagePercent: number,
  boundaries?: {
    peakEnd?: number;
    goodEnd?: number;
    degradingEnd?: number;
  },
): ContextZone {
  const peakEnd = boundaries?.peakEnd ?? 30;
  const goodEnd = boundaries?.goodEnd ?? 50;
  const degradingEnd = boundaries?.degradingEnd ?? 70;

  if (usagePercent <= peakEnd) return "peak";
  if (usagePercent <= goodEnd) return "good";
  if (usagePercent <= degradingEnd) return "degrading";
  return "stop";
}

// ─── Summary Degradation ─────────────────────────────────────────────────────

/**
 * Degrade a step summary based on the current context zone.
 *
 * Degradation policy:
 *   - "peak"/"good":  Full summary (intent, decisions, artifacts, outputPointers)
 *   - "degrading":    Decisions-only (drop artifacts and outputPointers)
 *   - "stop":         Minimal (keep only stepId and status)
 *
 * @param summary - The full step summary to degrade
 * @param zone - The current context zone
 * @returns A new StepSummary with fields stripped per zone policy
 *
 * @example
 * ```typescript
 * const full = { stepId: "a", intent: "do X", decisions: ["chose Y"],
 *                artifacts: ["src/a.ts"], outputPointers: ["ref:a"], status: "completed" as const };
 * degradeSummary(full, "stop")
 * // -> { stepId: "a", intent: "", decisions: [], artifacts: [], outputPointers: [], status: "completed" }
 * ```
 */
export function degradeSummary(
  summary: StepSummary,
  zone: ContextZone,
): StepSummary {
  switch (zone) {
    case "peak":
    case "good":
      // Full summary — return as-is
      return { ...summary };

    case "degrading":
      // Decisions-only — drop artifacts and outputPointers
      return {
        ...summary,
        artifacts: [],
        outputPointers: [],
      };

    case "stop":
      // Minimal — keep only stepId and status
      return {
        stepId: summary.stepId,
        intent: "",
        decisions: [],
        artifacts: [],
        outputPointers: [],
        status: summary.status,
      };
  }
}

// ─── Summary Formatting ──────────────────────────────────────────────────────

/**
 * Render degraded summaries as a compact text block for downstream step context.
 *
 * Uses markdown-style formatting: step ID as header, decisions as bullet list.
 * The output is designed for inclusion in LLM context, not for human display.
 *
 * @param summaries - Array of step summaries (already degraded)
 * @param zone - Current context zone (affects formatting density)
 * @returns Formatted text block suitable for context injection
 *
 * @example
 * ```typescript
 * formatSummariesForContext([
 *   { stepId: "classify", intent: "Classified task", decisions: ["Set complexity=MODERATE"],
 *     artifacts: [], outputPointers: [], status: "completed" },
 * ], "degrading")
 * // -> "### classify [completed]\nClassified task\n- Set complexity=MODERATE\n"
 * ```
 */
export function formatSummariesForContext(
  summaries: StepSummary[],
  zone: ContextZone,
): string {
  if (summaries.length === 0) return "";

  const lines: string[] = [];

  for (const summary of summaries) {
    const degraded = degradeSummary(summary, zone);

    // Header line: step ID and status
    lines.push(`### ${degraded.stepId} [${degraded.status}]`);

    // Intent (if present after degradation)
    if (degraded.intent) {
      lines.push(degraded.intent);
    }

    // Decisions as bullet list
    for (const decision of degraded.decisions) {
      lines.push(`- ${decision}`);
    }

    // Artifacts (only present in full mode)
    if (degraded.artifacts.length > 0) {
      lines.push(`Files: ${degraded.artifacts.join(", ")}`);
    }

    // Output pointers (only present in full mode)
    if (degraded.outputPointers.length > 0) {
      lines.push(`Outputs: ${degraded.outputPointers.join(", ")}`);
    }

    // Blank line between summaries
    lines.push("");
  }

  return lines.join("\n");
}
