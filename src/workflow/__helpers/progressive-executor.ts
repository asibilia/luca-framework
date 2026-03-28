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
