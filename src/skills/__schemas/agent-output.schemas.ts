/**
 * Structured output contract schemas for Agent() sub-agents.
 *
 * All Agent() sub-agents return a STATUS/RESULT text output that the
 * orchestrator parses into structured data. These schemas define the
 * expected shape and the parser handles malformed/missing output with
 * fail-closed semantics (missing STATUS = failure).
 *
 * @module agent-output
 */

import { z } from "zod";

// ─── Base Output Contract ─────────────────────────────────────────────────

/**
 * Base output contract — all agents must return STATUS and RESULT.
 *
 * @example
 * ```
 * STATUS: success
 * RESULT: Phase 230 executed, 3 waves completed, 12 tasks done
 * ```
 */
export const AgentOutputSchema = z.object({
  status: z.enum(["success", "failure"]),
  result: z.string(),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// ─── Extended Contracts ───────────────────────────────────────────────────

/**
 * Output from classify/routing agents that return complexity and route decisions.
 */
export const ClassifyOutputSchema = AgentOutputSchema.extend({
  complexity: z.string().optional(),
  route: z.string().optional(),
});

export type ClassifyOutput = z.infer<typeof ClassifyOutputSchema>;

/**
 * Output from harness check agents that report pass/fail with error details.
 */
export const HarnessOutputSchema = AgentOutputSchema.extend({
  passed: z.boolean().optional(),
  errors: z.array(z.string()).optional(),
});

export type HarnessOutput = z.infer<typeof HarnessOutputSchema>;

/**
 * Output from review agents that return findings grouped by severity.
 */
export const ReviewOutputSchema = AgentOutputSchema.extend({
  findings_count: z.number().optional(),
  critical_count: z.number().optional(),
});

export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

// ─── Parser ───────────────────────────────────────────────────────────────

const STATUS_PATTERN = /STATUS:\s*(success|failure)/i;
const RESULT_PATTERN = /RESULT:\s*([\s\S]*?)(?=\n[A-Z_]+:\s|$)/i;
const FIELD_PATTERN = (name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}:\\s*(.+?)(?:\\n|$)`, "i");
};

/**
 * Parse raw Agent() text output into structured result.
 *
 * Extracts STATUS and RESULT from the agent's text response.
 * Falls back to treating entire response as failure if STATUS marker
 * is missing (fail-closed semantics per RISK-A1).
 *
 * @param rawText - The raw text returned by the Agent() call
 * @returns Parsed output with status and result fields
 *
 * @example
 * ```typescript
 * const output = parseAgentOutput(agentReturnText);
 * if (output.status === "failure") {
 *   // Handle failure — retry or skip
 * }
 * ```
 */
export const parseAgentOutput = (rawText: string): AgentOutput => {
  if (!rawText || rawText.trim().length === 0) {
    return { status: "failure", result: "Agent returned empty output" };
  }

  const statusMatch = rawText.match(STATUS_PATTERN);
  if (!statusMatch) {
    // Fail-closed: missing STATUS marker treated as failure
    return {
      status: "failure",
      result: `Agent output missing STATUS marker. Raw output: ${rawText.slice(0, 200)}`,
    };
  }

  const status = (statusMatch[1] ?? "failure").toLowerCase() as
    | "success"
    | "failure";
  const resultMatch = rawText.match(RESULT_PATTERN);
  const result = resultMatch?.[1]?.trim() ?? rawText;

  return { status, result };
};

/**
 * Parse Agent() output with extended fields (complexity, route, etc.).
 *
 * Extracts STATUS/RESULT plus any additional named fields present in the text.
 *
 * @param rawText - The raw text returned by the Agent() call
 * @param fields - Additional field names to extract
 * @returns Base output plus extracted field values
 */
export const parseAgentOutputExtended = (
  rawText: string,
  fields: string[],
): AgentOutput & Record<string, string | undefined> => {
  const base = parseAgentOutput(rawText);
  const extended: Record<string, string | undefined> = { ...base };

  for (const field of fields) {
    const match = rawText.match(FIELD_PATTERN(field));
    extended[field] = match?.[1]?.trim();
  }

  return extended as AgentOutput & Record<string, string | undefined>;
};
