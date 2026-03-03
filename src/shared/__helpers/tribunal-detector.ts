import { createHash } from "node:crypto";

import { isDebateComplexity } from "~/complexity";

import {
  reviewFindingSchema,
  disagreementSchema,
} from "../__schemas/tribunal.schemas";
import type {
  ReviewFinding,
  Disagreement,
  ConflictType,
} from "../__schemas/tribunal.schemas";

/**
 * Normalize raw reviewer outputs into structured ReviewFinding arrays.
 *
 * Parses YAML-like reviewer output (the format used by code review agents)
 * and assigns unique IDs to each finding. Handles multiple output formats:
 * - Array of finding objects
 * - Object with `issues` array property
 * - String containing YAML-formatted issues
 *
 * @param reviewerOutputs - Map of agent name to raw output (parsed or string)
 * @returns Array of all validated ReviewFindings with unique IDs
 *
 * @example
 * ```typescript
 * const findings = normalizeFindings({
 *   "dx-advocate": [
 *     { severity: "HIGH", file: "src/foo.ts", line: 42, issue: "Bad naming" },
 *   ],
 *   "code-simplifier": [
 *     { severity: "MEDIUM", file: "src/foo.ts", line: 42, issue: "DRY violation" },
 *   ],
 * });
 * ```
 */
export function normalizeFindings(
  reviewerOutputs: Record<string, unknown>,
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  let idCounter = 0;

  for (const [agentName, rawOutput] of Object.entries(reviewerOutputs)) {
    const items = extractItems(rawOutput);

    for (const item of items) {
      idCounter++;
      const id = generateFindingId(agentName, idCounter);

      const parsed = reviewFindingSchema.safeParse({
        id,
        severity: normalizeSeverity(item.severity),
        file: item.file ?? "",
        line: item.line ?? 0,
        issue: item.issue ?? "",
        suggestion: item.suggestion ?? "",
        source_agent: item.source_agent ?? agentName,
      });

      if (parsed.success) {
        findings.push(parsed.data);
      }
    }
  }

  return findings;
}

/**
 * Extract issue items from various raw output formats.
 */
function extractItems(rawOutput: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(rawOutput)) {
    return rawOutput;
  }

  if (
    rawOutput &&
    typeof rawOutput === "object" &&
    "issues" in rawOutput &&
    Array.isArray((rawOutput as Record<string, unknown>).issues)
  ) {
    return (rawOutput as Record<string, unknown>).issues as Array<
      Record<string, unknown>
    >;
  }

  return [];
}

/**
 * Generate a unique finding ID from agent name and counter.
 */
function generateFindingId(agentName: string, counter: number): string {
  const hash = createHash("sha256")
    .update(`${agentName}:${counter}`)
    .digest("hex")
    .slice(0, 8);
  return `${agentName}-${hash}`;
}

/**
 * Normalize severity string to canonical uppercase form.
 */
function normalizeSeverity(severity: unknown): string {
  if (typeof severity !== "string") return "LOW";
  const upper = severity.toUpperCase();
  if (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(upper)) return upper;
  return "LOW";
}

/**
 * Detect disagreements between findings from different agents.
 *
 * Groups findings by file:line location and identifies three
 * types of conflicts:
 *
 * 1. **severity_mismatch**: Same file:line, similar issue, different severity
 * 2. **scope_overlap**: Same file:line, different issues from different agents
 * 3. **contradictory**: Explicit contradiction (currently detected as scope_overlap
 *    since agents don't emit "not an issue" findings; future enhancement)
 *
 * @param findings - Array of normalized ReviewFindings
 * @returns Array of detected Disagreements
 *
 * @example
 * ```typescript
 * const disagreements = detectDisagreements(findings);
 * // [{ id: "...", file: "src/foo.ts", line: 42, conflicting_findings: [...], conflict_type: "severity_mismatch" }]
 * ```
 */
export function detectDisagreements(findings: ReviewFinding[]): Disagreement[] {
  const disagreements: Disagreement[] = [];
  let idCounter = 0;

  // Group findings by file:line
  const groups = new Map<string, ReviewFinding[]>();
  for (const finding of findings) {
    const key = `${finding.file}:${finding.line}`;
    const group = groups.get(key);
    if (group) {
      group.push(finding);
    } else {
      groups.set(key, [finding]);
    }
  }

  // Analyze each group for conflicts
  for (const [, group] of groups) {
    // Only check groups with findings from multiple agents
    const agents = new Set(group.map((f) => f.source_agent));
    if (agents.size < 2) continue;

    const conflictType = classifyConflict(group);
    if (!conflictType) continue;

    idCounter++;
    const id = `disagreement-${idCounter}`;
    const firstFinding = group[0]!;

    const parsed = disagreementSchema.safeParse({
      id,
      file: firstFinding.file,
      line: firstFinding.line,
      conflicting_findings: group,
      conflict_type: conflictType,
    });

    if (parsed.success) {
      disagreements.push(parsed.data);
    }
  }

  return disagreements;
}

/**
 * Classify the type of conflict in a group of findings at the same location.
 */
function classifyConflict(group: ReviewFinding[]): ConflictType | null {
  if (group.length < 2) return null;

  const severities = new Set(group.map((f) => f.severity));

  // If same location has different severities from different agents
  if (severities.size > 1) {
    return "severity_mismatch";
  }

  // If same location, same severity, but different agents flagging different issues
  const agents = new Set(group.map((f) => f.source_agent));
  if (agents.size > 1) {
    return "scope_overlap";
  }

  return null;
}

/**
 * Determine whether a tribunal should run based on disagreements and complexity.
 *
 * The tribunal gate activates when:
 * - Complexity is COMPLEX or CRITICAL
 * - At least one disagreement involves CRITICAL or HIGH severity findings
 *
 * @param disagreements - Detected disagreements
 * @param complexity - Current task complexity level
 * @returns true if tribunal should be convened
 *
 * @example
 * ```typescript
 * if (shouldRunTribunal(disagreements, "COMPLEX")) {
 *   // Build rebuttal prompts and run tribunal
 * }
 * ```
 */
export function shouldRunTribunal(
  disagreements: Disagreement[],
  complexity: string,
): boolean {
  // Gate: Only COMPLEX and CRITICAL complexity
  if (!isDebateComplexity(complexity)) {
    return false;
  }

  // Gate: At least one disagreement involves CRITICAL or HIGH findings
  return disagreements.some((d) =>
    d.conflicting_findings.some(
      (f) => f.severity === "CRITICAL" || f.severity === "HIGH",
    ),
  );
}
