/**
 * Result envelope parser for sub-agent outputs.
 *
 * Schemas and types have been moved to __schemas/result-envelope.schemas.ts.
 * This file re-exports them for backward compatibility and provides the
 * `parseResultEnvelope` parsing function.
 *
 * @module context/__helpers/result-envelope
 */

import type { ContextTier } from "../__schemas/context.schemas";

import { resultEnvelopeSchema } from "../__schemas/result-envelope.schemas";

import type { ResultEnvelope } from "../__schemas/result-envelope.schemas";

// ---------------------------------------------------------------------------
// Re-exports (backward compatibility — consumers that import from here)
// ---------------------------------------------------------------------------

export {
  RESULT_STATUSES,
  resultStatusSchema,
  ISSUE_SEVERITIES,
  issueSeveritySchema,
  ARTIFACT_ACTIONS,
  artifactActionSchema,
  resultArtifactSchema,
  resultIssueSchema,
  resultMetadataSchema,
  resultEnvelopeSchema,
} from "../__schemas/result-envelope.schemas";

export type {
  ResultStatus,
  IssueSeverity,
  ResultArtifact,
  ResultIssue,
  ResultMetadata,
  ResultEnvelope,
} from "../__schemas/result-envelope.schemas";

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
