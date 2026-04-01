/**
 * Zod schemas and types for the universal result envelope.
 *
 * Extracted from __helpers/result-envelope.ts to follow the structural
 * invariant: schemas live in __schemas/, logic lives in __helpers/.
 *
 * Every sub-agent invocation returns a ResultEnvelope: a structured
 * JSON object containing the execution status, a human-readable summary,
 * a list of artifacts (files created/modified/deleted), and any issues
 * found during execution. Metadata tracks the agent name, duration,
 * context tier used, and isolation mode.
 *
 * @module context/__schemas/result-envelope.schemas
 */
import { z } from "zod";

import { contextTierSchema, isolationModeSchema } from "./context.schemas";

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
  /** Plan number that this issue traces to (for verifier gap attribution) */
  source_plan: z.string().optional(),
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
