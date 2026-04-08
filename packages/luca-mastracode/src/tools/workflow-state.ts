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
import { MODE_PERMISSIONS } from "./mode-permissions.js";

const VALID_MODES = Object.keys(MODE_PERMISSIONS);

export const PIPELINE_ORDER: Record<string, string | undefined> = {
  "luca:1-triage": "luca:2-research",
  "luca:2-research": "luca:3-architect",
  "luca:3-architect": "luca:4-execute",
  "luca:4-execute": "luca:5-review",
  "luca:5-review": "luca:6-finalize",
  "luca:6-finalize": undefined,
};

// ── Per-action Zod schemas (discriminated union variants) ──────────

const readAction = z.object({ action: z.literal("read") });

const writeAction = z.object({
  action: z.literal("write"),
  updates: z.record(z.string(), z.unknown())
    .describe("State fields to update (build/fast modes only)"),
});

const switchModeAction = z.object({
  action: z.literal("switch-mode"),
  targetMode: z.string()
    .describe("Target mode ID to switch to. Must be one of: build, plan, fast, luca:discuss, luca:1-triage, luca:2-research, luca:3-architect, luca:4-execute, luca:5-review, luca:6-finalize"),
  userRequest: z.string().optional()
    .describe("Original user request to pass to the target mode. Written to state as 'intent' before switching."),
});

const startPhaseAction = z.object({
  action: z.literal("start-phase"),
  phaseName: z.string()
    .describe("Phase name from ROADMAP.md"),
});

const recordIterationAction = z.object({ action: z.literal("record-iteration") });

const advanceWaveAction = z.object({ action: z.literal("advance-wave") });

const completePhaseAction = z.object({
  action: z.literal("complete-phase"),
  verificationPassed: z.boolean().optional()
    .describe("Whether verification passed"),
  reviewPassed: z.boolean().optional()
    .describe("Whether review passed"),
});

const saveTriageResultsAction = z.object({
  action: z.literal("save-triage-results"),
  intent: z.string().describe("Parsed intent summary"),
  complexity: z.enum(["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"])
    .describe("Classified complexity level"),
  oversight: z.enum(["full-auto", "checkpoint", "human-in-loop"])
    .describe("Oversight mode"),
  profile: z.string().optional()
    .describe("Execution profile"),
  affectedAreas: z.array(z.string()).optional()
    .describe("List of affected packages/modules"),
  skipResearch: z.boolean().optional()
    .describe("Skip research phase for trivial/simple tasks"),
});

const savePlanArtifactsAction = z.object({
  action: z.literal("save-plan-artifacts"),
  planFile: z.string().describe("Path to PLAN.md"),
  roadmapFile: z.string().optional()
    .describe("Path to ROADMAP.md"),
});

const saveReviewResultsAction = z.object({
  action: z.literal("save-review-results"),
  iterationPlan: z.array(z.string()).optional()
    .describe("Focused list of fixes for next execute iteration"),
  reviewIteration: z.number().optional()
    .describe("Review iteration number"),
});

const resetPipelineAction = z.object({ action: z.literal("reset-pipeline") });

/**
 * All action variants — exported for createScopedTool to filter.
 * The array order determines the discriminated union variant order.
 */
export const WORKFLOW_STATE_VARIANTS = [
  readAction,
  writeAction,
  switchModeAction,
  startPhaseAction,
  recordIterationAction,
  advanceWaveAction,
  completePhaseAction,
  saveTriageResultsAction,
  savePlanArtifactsAction,
  saveReviewResultsAction,
  resetPipelineAction,
] as const;

export type WorkflowStateInput = z.infer<typeof WORKFLOW_STATE_VARIANTS[number]>;

export const workflowStateTool = createTool({
  id: "workflow-state",
  description:
    "Read and write Luca workflow state. State persists to .planning/luca-state.json. Use this to track pipeline progress, update phase status, and trigger mode transitions.",
  inputSchema: z.discriminatedUnion("action", [
    readAction,
    writeAction,
    switchModeAction,
    startPhaseAction,
    recordIterationAction,
    advanceWaveAction,
    completePhaseAction,
    saveTriageResultsAction,
    savePlanArtifactsAction,
    saveReviewResultsAction,
    resetPipelineAction,
  ]),
  execute: async (inputData) => {
    switch (inputData.action) {
      case "read": {
        const state = readLucaState();
        return {
          success: true,
          message: "State read successfully",
          state,
        };
      }
      case "write": {
        const merged = writeLucaState(inputData.updates);
        return {
          success: true,
          message: `Updated state: ${Object.keys(inputData.updates).join(", ")}`,
          state: merged,
        };
      }
      case "switch-mode": {
        const { targetMode } = inputData;
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
        // Non-pipeline targets (build, plan, fast, luca:discuss) are always allowed
        // (user override / manual exit from pipeline).
        const PIPELINE_MODES = new Set(Object.keys(PIPELINE_ORDER));
        const prevState = readLucaState();
        const currentStep = prevState.pipelineStep;

        if (currentStep && PIPELINE_MODES.has(currentStep) && PIPELINE_MODES.has(targetMode)) {
          const expectedNext = PIPELINE_ORDER[currentStep];

          if (targetMode !== expectedNext) {
            // Allow triage → architect skip when skipResearch is set
            if (currentStep === "luca:1-triage" && targetMode === "luca:3-architect" && prevState.skipResearch) {
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
            message: `Failed to switch mode: ${err instanceof Error ? err.message : String(err)}`,
            error: err instanceof Error ? err.stack : undefined,
          };
        }
      }
      case "start-phase": {
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
          budgetExceeded: iterState.budgetExceeded ?? false,
        });
        let iterMsg = `Recorded iteration ${iterState.currentIteration} for phase "${iterState.currentPhaseName}"`;
        if (iterState.budgetExceeded) {
          iterMsg += ` ⚠ Budget limit exceeded (maxChecksFixIterations). Consider advancing to the next wave or reporting remaining failures.`;
          appendLedger('budget-exceeded', { type: 'iteration', iteration: iterState.currentIteration, phase: iterState.currentPhaseName });
        }
        return {
          success: true,
          message: iterMsg,
          state: iterState,
        };
      }
      case "advance-wave": {
        const waveState = advanceWave();
        appendLedger('wave-advance', {
          phase: waveState.currentPhaseName,
          wave: waveState.currentWave,
          budgetExceeded: waveState.budgetExceeded ?? false,
        });
        let waveMsg = `Advanced to wave ${waveState.currentWave} in phase "${waveState.currentPhaseName}"`;
        if (waveState.budgetExceeded) {
          waveMsg += ` ⚠ Budget limit exceeded (maxPhases). Consider completing the phase or reporting remaining work.`;
          appendLedger('budget-exceeded', { type: 'wave', wave: waveState.currentWave, phase: waveState.currentPhaseName });
        }
        return {
          success: true,
          message: waveMsg,
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
        const triageState = writeLucaState({
          intent: inputData.intent,
          complexity: inputData.complexity,
          oversight: inputData.oversight,
          profile: inputData.profile ?? "balanced",
          affectedAreas: inputData.affectedAreas ?? [],
          skipResearch: inputData.skipResearch ?? false,
          pipelineStep: "luca:1-triage",
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
        return { success: false, message: `Unknown action: ${(inputData as { action: string }).action}` };
    }
  },
});
