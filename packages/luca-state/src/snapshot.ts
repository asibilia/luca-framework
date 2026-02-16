/**
 * STATE.md snapshot generator from workflow machine context.
 *
 * Generates a markdown representation of the current state machine
 * snapshot suitable for writing to `.planning/STATE.md`. Supports
 * preserving existing human-authored sections when regenerating.
 *
 * Uses snake_case for all schema field names per API conventions.
 *
 * @module luca-state/snapshot
 */
import type { WorkflowContext, PhaseResult } from "./types";
import type { WorkflowState } from "./types";
import { escapeRegex } from "./utils/cli-utils";

// ─── Preservable Sections ────────────────────────────────────────────────────

/**
 * Section headers that should be preserved from existing STATE.md content.
 *
 * When regenerating STATE.md, these sections are extracted from the
 * existing file and merged into the new output to prevent data loss.
 */
const PRESERVABLE_SECTIONS = [
  "Previous Milestones",
  "Pending Todos",
  "Next Actions",
  "Project Reference",
  "Blockers",
] as const;

// ─── Section Extraction ──────────────────────────────────────────────────────

/**
 * Extract a named markdown section (## Header) from content.
 *
 * Returns everything between the `## Header` line and the next
 * `## ` heading (or end of file). Returns undefined if the section
 * is not found.
 *
 * @param content - Full markdown content to search
 * @param header - The section header text (without ## prefix)
 * @returns The section content including the header line, or undefined
 *
 * @example
 * ```typescript
 * const section = extractSection(stateContent, "Previous Milestones");
 * // "## Previous Milestones\n\n### v1.4.0 ...\n"
 * ```
 */
export function extractSection(
  content: string,
  header: string,
): string | undefined {
  const headerPattern = new RegExp(`^## ${escapeRegex(header)}\\s*$`, "m");
  const match = content.match(headerPattern);
  if (!match || match.index === undefined) return undefined;

  const start = match.index;
  // Find the next ## heading after this one
  const rest = content.slice(start + match[0].length);
  const nextHeading = rest.match(/^## /m);

  if (nextHeading && nextHeading.index !== undefined) {
    return content
      .slice(start, start + match[0].length + nextHeading.index)
      .trimEnd();
  }

  // No next heading -- take everything to end of file
  return content.slice(start).trimEnd();
}

/**
 * Extract all preservable sections from existing STATE.md content.
 *
 * @param content - Full markdown content of the existing STATE.md
 * @returns Map of section header to section content (including header line)
 */
export function extractPreservableSections(
  content: string,
): Map<string, string> {
  const sections = new Map<string, string>();
  for (const header of PRESERVABLE_SECTIONS) {
    const section = extractSection(content, header);
    if (section) {
      sections.set(header, section);
    }
  }
  return sections;
}

// ─── Formatting Helpers ──────────────────────────────────────────────────────

/**
 * Format a workflow state value for display.
 *
 * Converts the machine state string to a human-readable label.
 *
 * @param state - The workflow state value
 * @returns Formatted state string (e.g., "Executing", "Idle")
 */
function formatState(state: string): string {
  const labels: Record<string, string> = {
    idle: "Idle",
    preflight: "Pre-flight",
    routing: "Routing",
    discussing: "Discussing",
    planning: "Planning",
    executing: "Executing",
    verifying: "Verifying",
    learning: "Learning",
    committing: "Committing",
    complete: "Complete",
    paused: "Paused",
    failed: "Failed",
  };
  return labels[state] ?? state;
}

/**
 * Format a phase result status as an emoji indicator.
 */
function formatPhaseStatus(status: string): string {
  switch (status) {
    case "passed":
      return "complete";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    default:
      return status;
  }
}

/**
 * Format phase results into a progress block.
 *
 * @param results - Array of phase results
 * @returns Formatted progress string
 */
function formatPhaseResults(results: PhaseResult[]): string {
  if (results.length === 0) return "(no phases completed yet)";

  return results
    .map((r) => {
      const status = formatPhaseStatus(r.status);
      const duration = r.duration_ms > 0 ? ` (${r.duration_ms}ms)` : "";
      const summary = r.summary ? ` — ${r.summary}` : "";
      return `  Phase ${r.phase_id}: ${status}${summary}${duration}`;
    })
    .join("\n");
}

/**
 * Format an ISO timestamp to a date string.
 */
function formatDate(iso: string | undefined): string {
  if (!iso) return "unknown";
  try {
    const parts = new Date(iso).toISOString().split("T");
    return parts[0] ?? iso;
  } catch {
    return iso;
  }
}

// ─── Snapshot Types ──────────────────────────────────────────────────────────

/**
 * Input for the snapshot generator.
 *
 * Contains the machine state value and full context,
 * plus optional existing STATE.md content for section preservation.
 */
export interface SnapshotInput {
  /** Current machine state value (e.g., "idle", "executing") */
  state: WorkflowState | string;
  /** Full workflow context from the machine snapshot */
  context: WorkflowContext;
  /** Optional: existing STATE.md content for section preservation */
  existing_content?: string;
  /** Optional: list of allowed events in current state */
  allowed_events?: string[];
}

// ─── Snapshot Generator ──────────────────────────────────────────────────────

/**
 * Generate a STATE.md markdown snapshot from machine state and context.
 *
 * Produces a complete STATE.md document including:
 * - Current position (state, complexity, oversight, milestone, phase)
 * - Session identity (session_id, ticket, branch)
 * - Phase results progress
 * - Verification status
 * - Git context
 * - Session continuity info
 *
 * When `existing_content` is provided, preservable sections (Previous
 * Milestones, Pending Todos, Next Actions, Project Reference, Blockers)
 * are extracted from the existing content and merged into the output.
 *
 * @param input - Snapshot input with state, context, and optional existing content
 * @returns Generated STATE.md markdown string
 *
 * @example
 * ```typescript
 * const actor = result.data;
 * const snapshot = actor.getSnapshot();
 * const markdown = generateSnapshot({
 *   state: String(snapshot.value),
 *   context: snapshot.context,
 *   existing_content: await Bun.file(".planning/STATE.md").text(),
 *   allowed_events: getAllowedEvents(snapshot),
 * });
 * await Bun.write(".planning/STATE.md", markdown);
 * ```
 */
export function generateSnapshot(input: SnapshotInput): string {
  const { state, context, existing_content, allowed_events } = input;

  // Extract preservable sections from existing content
  const preserved = existing_content
    ? extractPreservableSections(existing_content)
    : new Map<string, string>();

  const lines: string[] = [];

  // ── Header ──
  lines.push("# Project State");
  lines.push("");

  // ── Current Position ──
  lines.push("## Current Position");
  lines.push("");
  if (context.current_milestone) {
    lines.push(`- **Current Milestone:** ${context.current_milestone}`);
  }
  if (context.current_phase !== undefined && context.current_phase !== null) {
    lines.push(`- **Current Phase:** Phase ${context.current_phase}`);
  }
  lines.push(`- **Status:** ${formatState(state)}`);
  lines.push(`- **Task Complexity:** ${context.complexity}`);
  lines.push(`- **Oversight:** ${context.oversight}`);
  lines.push(`- **Last Updated:** ${formatDate(context.last_transition_at)}`);
  lines.push("");

  // ── Session Identity ──
  lines.push("## Session Identity");
  lines.push("");
  lines.push(`- **Session ID:** ${context.session_id}`);
  if (context.ticket_id) {
    lines.push(`- **Ticket:** ${context.ticket_id}`);
  }
  if (context.github_issue !== undefined && context.github_issue !== null) {
    lines.push(`- **GitHub Issue:** #${context.github_issue}`);
  }
  lines.push("");

  // ── Progress ──
  lines.push("## Progress");
  lines.push("");
  lines.push("```");
  lines.push(formatPhaseResults(context.phase_results));
  lines.push("```");
  lines.push("");

  // ── Verification ──
  if (state === "verifying" || context.verification_attempts > 0) {
    lines.push("## Verification");
    lines.push("");
    lines.push(
      `- **Attempts:** ${context.verification_attempts} / ${context.max_verification_attempts}`,
    );
    if (context.harness_result) {
      lines.push(`- **Harness Status:** ${context.harness_result.status}`);
      lines.push(`- **Errors:** ${context.harness_result.total_errors}`);
      lines.push(`- **Warnings:** ${context.harness_result.total_warnings}`);
    }
    lines.push("");
  }

  // ── Errors ──
  if (context.last_error) {
    lines.push("## Errors");
    lines.push("");
    lines.push(`- **Last Error:** ${context.last_error}`);
    lines.push("");
  }

  // ── Git Context ──
  if (context.branch || context.base_branch) {
    lines.push("## Git Context");
    lines.push("");
    if (context.ticket_id) {
      lines.push(`- **Ticket:** ${context.ticket_id}`);
    }
    if (context.branch) {
      lines.push(`- **Branch:** ${context.branch}`);
    }
    if (context.base_branch) {
      lines.push(`- **Base Branch:** ${context.base_branch}`);
    }
    lines.push("");
  }

  // ── Allowed Events ──
  if (allowed_events && allowed_events.length > 0) {
    lines.push("## Allowed Events");
    lines.push("");
    lines.push(allowed_events.map((e) => `- \`${e}\``).join("\n"));
    lines.push("");
  }

  // ── Preserved Sections ──
  for (const header of PRESERVABLE_SECTIONS) {
    const section = preserved.get(header);
    if (section) {
      lines.push(section);
      lines.push("");
    }
  }

  // ── Session Continuity ──
  lines.push("## Session Continuity");
  lines.push("");
  lines.push(`- **Session Started:** ${formatDate(context.started_at)}`);
  lines.push(
    `- **Last Transition:** ${formatDate(context.last_transition_at)}`,
  );
  if (context.intuition_flags.length > 0) {
    lines.push(`- **Intuition Flags:** ${context.intuition_flags.join(", ")}`);
  }
  if (context.memory_tags.length > 0) {
    lines.push(`- **Memory Tags:** ${context.memory_tags.join(", ")}`);
  }
  lines.push("");

  // ── Footer ──
  lines.push("---");
  lines.push("");
  lines.push(
    `_State generated from machine snapshot at ${new Date().toISOString()}_`,
  );
  lines.push("");

  return lines.join("\n");
}
