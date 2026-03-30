/**
 * pre-edit-workflow-gate — Block source file edits when a workflow pipeline
 * has not completed the required prerequisite steps.
 *
 * PreToolUse hook on Edit|Write. Checks all 5 orchestrator context files
 * (lu, phase-execute, verify, milestone-complete, pr-address) for active
 * workflows. If any workflow is active and not in an edit-permitting state
 * with proper predecessor traversal, the edit is blocked.
 *
 * Fails open: missing context files, corrupted JSON, and parse failures
 * all result in allowing the edit (with stderr warnings).
 *
 * No guardDedup — every invocation is checked. This is a security gate,
 * not a nuisance filter.
 *
 * @module pre-edit-workflow-gate
 * @see .claude/plans/bubbly-finding-lark.md
 */

import { resolve } from "path";

import { HookContextSchema } from "../../workflow";

import {
  readStdinJson,
  extractFilePath,
  exitSuccess,
  exitBlock,
  projectDir,
} from "../__helpers/hook-io.ts";
import {
  ORCHESTRATOR_GATES,
  derivePipelineState,
  type OrchestratorGateConfig,
} from "../__helpers/orchestrator-gate-config.ts";

// ─── Source Directory Blocklist ───────────────────────────────────────────────

/** Directories containing source code — edits here are gated. */
const SOURCE_DIRS = ["src/", "scripts/", "packages/", "packages-dev/"];

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // No guardDedup — every invocation must be checked

  const data = await readStdinJson();
  const filePath = extractFilePath(data);

  if (!filePath) {
    return exitSuccess();
  }

  // Resolve and check if path targets a source directory
  const pd = projectDir();
  const resolved = resolve(filePath);

  // Only gate files within the project directory
  if (!resolved.startsWith(pd + "/") && resolved !== pd) {
    return exitSuccess();
  }

  // Get the relative path within the project
  const relative = resolved.slice(pd.length + 1);

  // Check if the file is in a source directory
  const isSource = SOURCE_DIRS.some((dir) => relative.startsWith(dir));
  if (!isSource) {
    return exitSuccess();
  }

  // Environment variable override
  if (process.env.LUCA_SKIP_EDIT_GATE === "1") {
    process.stderr.write(
      "pre-edit-workflow-gate: LUCA_SKIP_EDIT_GATE=1 — gate bypassed\n",
    );
    return exitSuccess();
  }

  // Check all orchestrator context files
  for (const gate of ORCHESTRATOR_GATES) {
    const blockReason = await checkOrchestratorGate(gate);
    if (blockReason) {
      return exitBlock(blockReason);
    }
  }

  return exitSuccess();
};

/**
 * Check a single orchestrator's context file against its gate config.
 *
 * Returns a block message if the edit should be blocked, or null if allowed.
 * Fails open on missing/corrupted files (returns null with stderr warning).
 *
 * @param gate - Orchestrator gate configuration
 * @returns Block message string or null
 */
const checkOrchestratorGate = async (
  gate: OrchestratorGateConfig,
): Promise<string | null> => {
  const file = Bun.file(gate.context_path);

  // Missing context file — no active workflow for this orchestrator
  if (!(await file.exists())) {
    return null;
  }

  // Read JSON — fail open on corruption
  let raw: unknown;
  try {
    raw = await file.json();
  } catch {
    process.stderr.write(
      `pre-edit-workflow-gate: Failed to read ${gate.context_path} — skipping (fail-open)\n`,
    );
    return null;
  }

  // Parse with schema — fail open on validation failure
  const parseResult = HookContextSchema.safeParse(raw);
  if (!parseResult.success) {
    process.stderr.write(
      `pre-edit-workflow-gate: Schema parse failed for ${gate.context_path} — skipping (fail-open)\n`,
    );
    return null;
  }

  const derived = derivePipelineState(
    raw as Record<string, unknown>,
    gate.use_computed_position ?? false,
  );

  // No current_state — treat as inactive
  if (!derived) {
    return null;
  }

  const { currentState, completedStates } = derived;

  // Terminal state — workflow is done, edits allowed
  if (gate.terminal_states.includes(currentState)) {
    return null;
  }

  // Active workflow — check if state permits edits
  if (gate.edit_permitting_states.length === 0) {
    // Workflow has no edit-permitting states (read-only workflow like verify)
    return formatBlockMessage(gate, currentState, completedStates);
  }

  if (gate.edit_permitting_states.includes(currentState)) {
    // In an edit-permitting state — check prerequisites
    if (gate.required_predecessor) {
      const history = completedStates ?? [];
      if (!history.includes(gate.required_predecessor)) {
        return formatBlockMessage(gate, currentState, completedStates);
      }
    }
    // State is valid and prerequisites met
    return null;
  }

  // Active but not in an edit-permitting state
  return formatBlockMessage(gate, currentState, completedStates);
};

/**
 * Format an actionable block message for the user.
 *
 * @param gate - Orchestrator gate config
 * @param currentState - Current workflow state
 * @param completedStates - States traversed so far
 * @returns Formatted block message
 */
const formatBlockMessage = (
  gate: OrchestratorGateConfig,
  currentState: string,
  completedStates: string[] | undefined,
): string => {
  const history = (completedStates ?? []).join(", ") || "(none)";
  const predecessor = gate.required_predecessor
    ? `\nRequired: '${gate.required_predecessor}' must be in completed_states`
    : "";

  return [
    `pre-edit-workflow-gate: Source file edit blocked.`,
    ``,
    `The ${gate.name} pipeline is active (state: '${currentState}') but has not`,
    `completed the required steps before code changes are permitted.`,
    ``,
    `Completed states: [${history}]${predecessor}`,
    `Context file: ${gate.context_path}`,
    ``,
    `To proceed: continue the pipeline, or override with:`,
    `  rm ${gate.context_path}`,
  ].join("\n");
};

await main();
