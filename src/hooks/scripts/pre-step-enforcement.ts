/**
 * pre-step-enforcement — Advisory pre-step validation hook.
 *
 * Fires before Bash and Skill tool invocations to validate workflow step
 * ordering and prerequisites. Uses millisecond-precision guardPreStep
 * to prevent re-entrancy during parallel wave execution.
 *
 * Advisory enforcement: emits systemMessage warnings when prerequisites
 * are missing, but never blocks execution. Fails open when the bridge
 * is unavailable or state cannot be read.
 *
 * Exit 0 = allow (always). This hook never blocks.
 *
 * @module pre-step-enforcement
 */

import {
  readStdinJson,
  extractCommand,
  emitResult,
  exitSuccess,
  guardPreStep,
} from "../__helpers/hook-io.ts";
import { runBridge } from "../__helpers/bridge.ts";

// ─── Guard: ms-precision dedup (must execute BEFORE any expensive ops) ──────

// Read stdin early so we can extract tool_name for the guard key.
// readStdinJson is cheap (no bridge calls, no file reads beyond stdin).
const stdinData = await readStdinJson();
const toolName = (stdinData?.tool_name as string) || "unknown";

// PREMORTEM Constraint #2: 200ms TTL dedup guard executes first,
// before any bridge calls or file reads.
guardPreStep("pre-step-enforcement", toolName);

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const command = extractCommand(stdinData);

  // Read current workflow state from bridge (fail-open: exit 0 on error)
  let statusJson: string;
  try {
    statusJson = await runBridge(["read-status"]);
  } catch {
    // Bridge unavailable — fail open, allow execution
    return exitSuccess();
  }

  // Empty response means bridge is not available or not initialized
  if (!statusJson) {
    return exitSuccess();
  }

  let status: Record<string, unknown>;
  try {
    status = JSON.parse(statusJson) as Record<string, unknown>;
  } catch {
    // Malformed JSON — fail open
    return exitSuccess();
  }

  // If state machine is not initialized, nothing to enforce
  if (!status.initialized) {
    return exitSuccess();
  }

  // Extract current phase and workflow state
  const currentPhase = status.phase as Record<string, unknown> | undefined;
  const currentState = status.state as string | undefined;

  // If no active phase, nothing to enforce
  if (!currentPhase || !currentState) {
    return exitSuccess();
  }

  // Check for expected step ordering. The bridge read-status response
  // includes state machine context with completed/skipped step info.
  // For now, emit advisory warnings when the workflow is in an
  // unexpected state for the current tool invocation.
  const context = status.context as Record<string, unknown> | undefined;
  const completedSteps = (context?.completedSteps as string[]) || [];
  const skippedSteps = (context?.skippedSteps as string[]) || [];

  // Advisory check: if we're executing but have no completed steps
  // and the state indicates we should be past initial setup,
  // warn about potential step skip.
  if (
    currentState === "executing" &&
    completedSteps.length === 0 &&
    skippedSteps.length === 0 &&
    (toolName === "Skill" || toolName === "Bash")
  ) {
    // Check if command looks like a step invocation
    const isStepInvocation =
      command.includes("phase-") ||
      command.includes("lu-") ||
      toolName === "Skill";

    if (isStepInvocation) {
      emitResult({
        systemMessage:
          `[pre-step-enforcement] Advisory: Workflow is in '${currentState}' state ` +
          `with no completed steps recorded. Verify that prerequisite steps ` +
          `have been executed before this invocation.`,
      });
    }
  }

  return exitSuccess();
};

await main();
