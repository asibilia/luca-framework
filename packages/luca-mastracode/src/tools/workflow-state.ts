import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { switchModeRef } from "../refs.js";
import {
  readLucaState,
  writeLucaState,
  startPhase,
  recordIteration,
  advanceWave,
  completePhase,
} from "../luca-store.js";
import { appendLedger } from "../session-ledger.js";

const VALID_MODES = ["build", "plan", "fast", "discuss", "triage", "research", "architect", "execute", "review", "finalize"];

export const PIPELINE_ORDER: Record<string, string | undefined> = {
  triage: "research",
  research: "architect",
  architect: "execute",
  execute: "review",
  review: "finalize",
  finalize: undefined,
};

export const workflowStateTool = createTool({
  id: "workflow-state",
  description:
    "Read and write Luca workflow state. State persists to .planning/luca-state.json. Use this to track pipeline progress, update phase status, and trigger mode transitions.",
  inputSchema: z.object({
    action: z
      .enum([
        "read", "write", "switch-mode", "next-mode",
        "start-phase", "record-iteration", "advance-wave", "complete-phase",
        "save-triage-results", "save-plan-artifacts", "save-review-results", "reset-pipeline",
      ])
      .describe(
        "Operation: read/write state, switch-mode/next-mode for transitions, start-phase/record-iteration/advance-wave/complete-phase for execution tracking, save-triage-results/save-plan-artifacts/save-review-results/reset-pipeline for typed state updates"
      ),
    updates: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("State fields to update (for write action — build/fast modes only)"),
    targetMode: z
      .string()
      .optional()
      .describe(
        "Target mode ID to switch to (for switch-mode action). Must be one of: build, plan, fast, discuss, triage, research, architect, execute, review, finalize"
      ),
    userRequest: z
      .string()
      .optional()
      .describe(
        "Original user request to pass to the target mode (for switch-mode action). Written to state as 'intent' before switching."
      ),
    phaseName: z
      .string()
      .optional()
      .describe("Phase name from ROADMAP.md (for start-phase action)"),
    verificationPassed: z
      .boolean()
      .optional()
      .describe("Whether verification passed (for complete-phase action)"),
    reviewPassed: z
      .boolean()
      .optional()
      .describe("Whether review passed (for complete-phase action)"),

    // --- Typed fields for save-triage-results ---
    intent: z.string().optional()
      .describe("Parsed intent summary (for save-triage-results)"),
    complexity: z.enum(["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"]).optional()
      .describe("Classified complexity level (for save-triage-results)"),
    oversight: z.enum(["full-auto", "checkpoint", "human-in-loop"]).optional()
      .describe("Oversight mode (for save-triage-results)"),
    profile: z.string().optional()
      .describe("Execution profile (for save-triage-results)"),
    affectedAreas: z.array(z.string()).optional()
      .describe("List of affected packages/modules (for save-triage-results)"),
    skipResearch: z.boolean().optional()
      .describe("Skip research phase for trivial/simple tasks (for save-triage-results)"),

    // --- Typed fields for save-plan-artifacts ---
    planFile: z.string().optional()
      .describe("Path to PLAN.md (for save-plan-artifacts)"),
    roadmapFile: z.string().optional()
      .describe("Path to ROADMAP.md (for save-plan-artifacts)"),

    // --- Typed fields for save-review-results ---
    iterationPlan: z.array(z.string()).optional()
      .describe("Focused list of fixes for next execute iteration (for save-review-results)"),
    reviewIteration: z.number().optional()
      .describe("Review iteration number (for save-review-results)"),
  }),
  execute: async (inputData) => {
    const { action, updates, targetMode } = inputData;

    switch (action) {
      case "read": {
        const state = readLucaState();
        return {
          success: true,
          message: "State read successfully",
          state,
        };
      }
      case "write": {
        if (!updates) return { success: false, message: "No updates provided" };
        const merged = writeLucaState(updates);
        return {
          success: true,
          message: `Updated state: ${Object.keys(updates).join(", ")}`,
          state: merged,
        };
      }
      case "switch-mode": {
        if (!targetMode)
          return { success: false, message: "No targetMode provided" };
        if (!VALID_MODES.includes(targetMode)) {
          return {
            success: false,
            message: `Invalid mode "${targetMode}". Valid modes: ${VALID_MODES.join(", ")}`,
          };
        }
        if (!switchModeRef.current) {
          return {
            success: false,
            message: "switchMode not available — harness not initialized",
          };
        }

        // --- Pipeline ordering enforcement ---
        // Validate that pipeline transitions follow the correct order.
        // Non-pipeline targets (build, plan, fast, discuss) are always allowed
        // (user override / manual exit from pipeline).
        const PIPELINE_MODES = new Set(Object.keys(PIPELINE_ORDER));
        const prevState = readLucaState();
        const currentStep = prevState.pipelineStep;

        if (currentStep && PIPELINE_MODES.has(currentStep) && PIPELINE_MODES.has(targetMode)) {
          const expectedNext = PIPELINE_ORDER[currentStep];

          if (targetMode !== expectedNext) {
            // Allow triage → architect skip when skipResearch is set
            if (currentStep === "triage" && targetMode === "architect" && prevState.skipResearch) {
              // Skip-ahead allowed
            } else {
              // Check if this is a backward jump or an invalid skip-ahead
              const pipelineSequence = Object.keys(PIPELINE_ORDER);
              const currentIdx = pipelineSequence.indexOf(currentStep);
              const targetIdx = pipelineSequence.indexOf(targetMode);

              if (targetIdx <= currentIdx) {
                // Backward jump — block it
                return {
                  success: false,
                  message: `Pipeline ordering violation: cannot go backward from "${currentStep}" to "${targetMode}". The correct next step is "${expectedNext}". Call workflowState(action: "switch-mode", targetMode: "${expectedNext}") instead.`,
                };
              }

              // Forward skip (but not the expected next) — block it
              return {
                success: false,
                message: `Pipeline ordering violation: cannot skip from "${currentStep}" to "${targetMode}". The correct next step is "${expectedNext}". Call workflowState(action: "switch-mode", targetMode: "${expectedNext}") instead.`,
              };
            }
          }
        }

        try {
          // Persist user request as intent so the target mode's continuation
          // message can include the original context.
          const stateUpdates: Record<string, unknown> = { pipelineStep: targetMode, nextMode: targetMode };
          if (inputData.userRequest) {
            stateUpdates.intent = inputData.userRequest;
          }
          writeLucaState(stateUpdates);
          appendLedger('mode-transition', { from: prevState.pipelineStep, to: targetMode });
          await switchModeRef.current(targetMode);
          return {
            success: true,
            message: `Switched to "${targetMode}" mode.`,
          };
        } catch (err) {
          return {
            success: false,
            message: `Failed to switch mode: ${err}`,
          };
        }
      }
      case "next-mode": {
        // Read current pipeline step from our file-based state
        const state = readLucaState();
        const current = state.pipelineStep ?? "triage";
        const next = PIPELINE_ORDER[current];
        if (!next) {
          return {
            success: true,
            message: `Pipeline complete — "${current}" is the final mode.`,
          };
        }
        if (!switchModeRef.current) {
          return {
            success: false,
            message: "switchMode not available — harness not initialized",
          };
        }
        try {
          writeLucaState({ pipelineStep: next, nextMode: next });
          await switchModeRef.current(next);
          return {
            success: true,
            message: `Advanced pipeline: ${current} → ${next}.`,
          };
        } catch (err) {
          return {
            success: false,
            message: `Failed to advance pipeline: ${err}`,
          };
        }
      }
      case "start-phase": {
        if (!inputData.phaseName) {
          return { success: false, message: "phaseName required for start-phase" };
        }
        const phaseState = startPhase({ name: inputData.phaseName });
        appendLedger('phase-start', { phase: inputData.phaseName });
        return {
          success: true,
          message: `Started phase "${inputData.phaseName}" (wave 1, iteration 0)`,
          state: phaseState,
        };
      }
      case "record-iteration": {
        const iterState = recordIteration();
        appendLedger('iteration-complete', {
          phase: iterState.currentPhaseName,
          wave: iterState.currentWave,
          iteration: iterState.currentIteration,
        });
        return {
          success: true,
          message: `Recorded iteration ${iterState.currentIteration} for phase "${iterState.currentPhaseName}"`,
          state: iterState,
        };
      }
      case "advance-wave": {
        const waveState = advanceWave();
        appendLedger('wave-advance', {
          phase: waveState.currentPhaseName,
          wave: waveState.currentWave,
        });
        return {
          success: true,
          message: `Advanced to wave ${waveState.currentWave} in phase "${waveState.currentPhaseName}"`,
          state: waveState,
        };
      }
      case "complete-phase": {
        const completeState = completePhase({
          verificationPassed: inputData.verificationPassed,
          reviewPassed: inputData.reviewPassed,
        });
        appendLedger('phase-complete', {
          phase: completeState.currentPhaseName,
          verificationPassed: inputData.verificationPassed,
          reviewPassed: inputData.reviewPassed,
          phasesCompleted: completeState.currentPhase,
          totalPhases: completeState.totalPhases,
        });
        return {
          success: true,
          message: `Completed phase "${completeState.currentPhaseName ?? 'unknown'}". ${completeState.currentPhase}/${completeState.totalPhases} phases done.`,
          state: completeState,
        };
      }
      case "save-triage-results": {
        if (!inputData.intent || !inputData.complexity || !inputData.oversight) {
          return { success: false, message: "intent, complexity, and oversight are required for save-triage-results" };
        }
        const triageState = writeLucaState({
          intent: inputData.intent,
          complexity: inputData.complexity,
          oversight: inputData.oversight,
          profile: inputData.profile ?? "balanced",
          affectedAreas: inputData.affectedAreas ?? [],
          skipResearch: inputData.skipResearch ?? false,
          pipelineStep: "triage",
          startedAt: new Date().toISOString(),
        });
        appendLedger("triage-complete", {
          complexity: inputData.complexity,
          oversight: inputData.oversight,
          skipResearch: inputData.skipResearch,
        });
        return {
          success: true,
          message: `Triage results saved (${inputData.complexity}, ${inputData.oversight})`,
          state: triageState,
        };
      }
      case "save-plan-artifacts": {
        if (!inputData.planFile) {
          return { success: false, message: "planFile is required for save-plan-artifacts" };
        }
        const planState = writeLucaState({
          planFile: inputData.planFile,
          roadmapFile: inputData.roadmapFile,
        });
        appendLedger("plan-artifacts-saved", {
          planFile: inputData.planFile,
          roadmapFile: inputData.roadmapFile,
        });
        return {
          success: true,
          message: `Plan artifacts saved (${inputData.planFile})`,
          state: planState,
        };
      }
      case "save-review-results": {
        const reviewState = writeLucaState({
          iterationPlan: inputData.iterationPlan,
          reviewIteration: inputData.reviewIteration,
        });
        appendLedger("review-results-saved", {
          reviewIteration: inputData.reviewIteration,
          issueCount: inputData.iterationPlan?.length ?? 0,
        });
        return {
          success: true,
          message: `Review results saved (iteration ${inputData.reviewIteration})`,
          state: reviewState,
        };
      }
      case "reset-pipeline": {
        const resetState = writeLucaState({
          pipelineStep: undefined,
          nextMode: undefined,
        });
        appendLedger("pipeline-reset", {});
        return {
          success: true,
          message: "Pipeline state reset",
          state: resetState,
        };
      }
      default:
        return { success: false, message: `Unknown action: ${action}` };
    }
  },
});
