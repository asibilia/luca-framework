/**
 * Universal result envelope for sub-agent outputs.
 *
 * Every sub-agent invocation returns a ResultEnvelope: a structured
 * JSON object containing the execution status, a human-readable summary,
 * a list of artifacts (files created/modified/deleted), and any issues
 * found during execution. Metadata tracks the agent name, duration,
 * context tier used, and isolation mode.
 *
 * When an agent returns raw text instead of valid JSON, the
 * `parseResultEnvelope` function wraps it in a fallback envelope with
 * status "partial" so the orchestrator can still proceed.
 */
import { z } from "zod";

import type { ContextTier, IsolationMode } from "./types";
import { contextTierSchema, isolationModeSchema } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Possible result statuses for a sub-agent invocation */
export const RESULT_STATUSES = [
  "success",
  "partial",
  "failed",
  "timeout",
] as const;

/** Zod enum for result statuses */
export const resultStatusSchema = z.enum(RESULT_STATUSES);

/** Result status type derived from schema */
export type ResultStatus = z.infer<typeof resultStatusSchema>;

/** Severity levels for issues reported by an agent */
export const ISSUE_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

/** Zod enum for issue severities */
export const issueSeveritySchema = z.enum(ISSUE_SEVERITIES);

/** Issue severity type derived from schema */
export type IssueSeverity = z.infer<typeof issueSeveritySchema>;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** File actions that an agent can perform on an artifact */
export const ARTIFACT_ACTIONS = ["created", "modified", "deleted"] as const;

/** Zod enum for artifact actions */
export const artifactActionSchema = z.enum(ARTIFACT_ACTIONS);

/**
 * A file artifact produced or modified by an agent.
 *
 * Uses snake_case for API compatibility.
 */
export const resultArtifactSchema = z.object({
  /** File path relative to project root */
  path: z.string(),
  /** What the agent did with the file */
  action: artifactActionSchema,
  /** Optional human-readable description of the change */
  description: z.string().optional(),
});

/** Result artifact type derived from schema */
export type ResultArtifact = z.infer<typeof resultArtifactSchema>;

/**
 * An issue (error, warning, or info) reported by an agent.
 *
 * Uses snake_case for API compatibility.
 */
export const resultIssueSchema = z.object({
  /** Severity of the issue */
  severity: issueSeveritySchema,
  /** Human-readable issue description */
  message: z.string(),
  /** Optional file path where the issue was found */
  file: z.string().optional(),
  /** Optional line number within the file */
  line: z.number().int().positive().optional(),
  /** Name of the agent that reported the issue */
  source_agent: z.string(),
  /** Optional suggestion for how to fix the issue */
  suggestion: z.string().optional(),
});

/** Result issue type derived from schema */
export type ResultIssue = z.infer<typeof resultIssueSchema>;

/**
 * Metadata about the agent invocation that produced a result.
 *
 * Uses snake_case for API compatibility.
 */
export const resultMetadataSchema = z.object({
  /** Name of the agent that produced this result */
  agent_name: z.string(),
  /** How long the agent ran in milliseconds */
  duration_ms: z.number().int().nonnegative().optional(),
  /** The context tier used for this invocation */
  context_tier: contextTierSchema,
  /** The isolation mode applied, if any */
  isolation_mode: isolationModeSchema.optional(),
});

/** Result metadata type derived from schema */
export type ResultMetadata = z.infer<typeof resultMetadataSchema>;

/**
 * The universal result envelope returned by every sub-agent.
 *
 * This is the standard contract between the orchestrator and sub-agents.
 * The orchestrator parses agent output into this shape, then uses the
 * status, artifacts, and issues to drive workflow decisions.
 *
 * Uses snake_case for API compatibility.
 */
export const resultEnvelopeSchema = z.object({
  /** Overall execution status */
  status: resultStatusSchema,
  /** Human-readable summary of what the agent did */
  summary: z.string(),
  /** Files created, modified, or deleted */
  artifacts: z.array(resultArtifactSchema).default([]),
  /** Issues found during execution */
  issues: z.array(resultIssueSchema).default([]),
  /** Metadata about the invocation */
  metadata: resultMetadataSchema,
});

/** Result envelope type derived from schema */
export type ResultEnvelope = z.infer<typeof resultEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Maximum length for the summary in a fallback envelope */
const FALLBACK_SUMMARY_MAX_LENGTH = 2000;

/**
 * Parse raw agent output into a ResultEnvelope.
 *
 * Attempts JSON.parse followed by Zod safeParse. On any failure,
 * returns a fallback envelope with status "partial" and the raw text
 * truncated to 2000 characters as the summary.
 *
 * @param raw - The raw string output from a sub-agent
 * @param agentName - Name of the agent for metadata
 * @param contextTier - The context tier used for this invocation (defaults to "T0")
 * @returns A validated ResultEnvelope
 *
 * @example
 * ```typescript
 * // Valid JSON envelope
 * const envelope = parseResultEnvelope(
 *   '{"status":"success","summary":"Done","artifacts":[],"issues":[],"metadata":{"agent_name":"lu-executor","context_tier":"T2"}}',
 *   "lu-executor"
 * )
 *
 * // Invalid output falls back gracefully
 * const fallback = parseResultEnvelope("Some raw text output", "lu-verifier")
 * // fallback.status === "partial"
 * // fallback.summary === "Some raw text output"
 * ```
 */
export function parseResultEnvelope(
  raw: string,
  agentName: string,
  contextTier: ContextTier = "T0",
): ResultEnvelope {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = resultEnvelopeSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }
  } catch {
    // JSON.parse failed -- fall through to fallback
  }

  // Fallback: wrap raw text in a partial envelope
  return {
    status: "partial",
    summary: raw.slice(0, FALLBACK_SUMMARY_MAX_LENGTH),
    artifacts: [],
    issues: [],
    metadata: {
      agent_name: agentName,
      context_tier: contextTier,
    },
  };
}
