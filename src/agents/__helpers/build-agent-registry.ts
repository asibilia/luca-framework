/**
 * Agent registry assembly for the Luca Framework
 *
 * Builds the registry mapping agent names to factory functions
 * for bulk processing by the build pipeline.
 */

// Import all general agents
import { codeArchitectAgent } from "../general/code-architect.agent";
import { codeDeveloperAgent } from "../general/code-developer.agent";
import { codeSimplifierAgent } from "../general/code-simplifier.agent";
import { luDiscussResearcherAgent } from "../general/lu-discuss-researcher.agent";
import { dxAdvocateAgent } from "../general/dx-advocate.agent";
import { luCodebaseMapperAgent } from "../general/lu-codebase-mapper.agent";
import { luCognitionAgent } from "../general/lu-cognition.agent";
import { luDebuggerAgent } from "../general/lu-debugger.agent";
import { luIntegrationCheckerAgent } from "../general/lu-integration-checker.agent";
import { luLearnerAgent } from "../general/lu-learner.agent";
import { luPhaseResearcherAgent } from "../general/lu-phase-researcher.agent";
import { luPlanCheckerAgent } from "../general/lu-plan-checker.agent";
import { luPmPlannerAgent } from "../general/lu-pm-planner.agent";
import { luPrReviewerAgent } from "../general/lu-pr-reviewer.agent";
import { luRoadmapArchitectAgent } from "../general/lu-roadmap-architect.agent";
import { luRoadmapPrioritizerAgent } from "../general/lu-roadmap-prioritizer.agent";
import { luRoadmapQaAgent } from "../general/lu-roadmap-qa.agent";
import { luRoadmapSynthesizerAgent } from "../general/lu-roadmap-synthesizer.agent";
import { luRepoArchitectAgent } from "../general/lu-repo-architect.agent";
import { luProjectResearcherAgent } from "../general/lu-project-researcher.agent";
import { luResearchSynthesizerAgent } from "../general/lu-research-synthesizer.agent";
import { luRoadmapperAgent } from "../general/lu-roadmapper.agent";
import { luRouterAgent } from "../general/lu-router.agent";
import { luRouterFastAgent } from "../general/lu-router-fast.agent";
import { luTestWriterAgent } from "../general/lu-test-writer.agent";
import { luVerifierAgent } from "../general/lu-verifier.agent";
import { luVerifierFastAgent } from "../general/lu-verifier-fast.agent";
import { luExecutorCapableAgent } from "../general/lu-executor-capable.agent";
import { performanceAuditorAgent } from "../general/performance-auditor.agent";
import { productAgent } from "../general/product.agent";
import { qaPlanGeneratorAgent } from "../general/qa-plan-generator.agent";
import { securityAuditorAgent } from "../general/security-auditor.agent";
import { uiAgent } from "../general/ui.agent";
import { uxAgent } from "../general/ux.agent";

// Import Luca-specific agents
import { luExecutorAgent } from "../luca/lu-executor.agent";
import { luPlannerAgent } from "../luca/lu-planner.agent";
import { luPremortemAgent } from "../luca/lu-premortem.agent";

import type { BaseAgent } from "../__schemas/agent.schemas";

/**
 * Registry mapping agent names to factory functions for bulk processing.
 *
 * Consumed by the build pipeline (build-shared.ts) to generate
 * .claude/ and .cursor/ agent definition files.
 */
export const agentRegistry: Record<string, () => BaseAgent> = {
  "code-architect": () => codeArchitectAgent,
  "code-developer": () => codeDeveloperAgent,
  "code-simplifier": () => codeSimplifierAgent,
  "dx-advocate": () => dxAdvocateAgent,
  "lu-codebase-mapper": () => luCodebaseMapperAgent,
  "lu-cognition": () => luCognitionAgent,
  "lu-debugger": () => luDebuggerAgent,
  "lu-discuss-researcher": () => luDiscussResearcherAgent,
  "lu-integration-checker": () => luIntegrationCheckerAgent,
  "lu-learner": () => luLearnerAgent,
  "lu-phase-researcher": () => luPhaseResearcherAgent,
  "lu-plan-checker": () => luPlanCheckerAgent,
  "lu-pm-planner": () => luPmPlannerAgent,
  "lu-pr-reviewer": () => luPrReviewerAgent,
  "lu-roadmap-architect": () => luRoadmapArchitectAgent,
  "lu-roadmap-prioritizer": () => luRoadmapPrioritizerAgent,
  "lu-roadmap-qa": () => luRoadmapQaAgent,
  "lu-roadmap-synthesizer": () => luRoadmapSynthesizerAgent,
  "lu-repo-architect": () => luRepoArchitectAgent,
  "lu-project-researcher": () => luProjectResearcherAgent,
  "lu-research-synthesizer": () => luResearchSynthesizerAgent,
  "lu-roadmapper": () => luRoadmapperAgent,
  "lu-router": () => luRouterAgent,
  "lu-router-fast": () => luRouterFastAgent,
  "lu-test-writer": () => luTestWriterAgent,
  "lu-verifier": () => luVerifierAgent,
  "lu-verifier-fast": () => luVerifierFastAgent,
  "lu-executor-capable": () => luExecutorCapableAgent,
  "performance-auditor": () => performanceAuditorAgent,
  product: () => productAgent,
  "qa-plan-generator": () => qaPlanGeneratorAgent,
  "security-auditor": () => securityAuditorAgent,
  ui: () => uiAgent,
  ux: () => uxAgent,
  "lu-executor": () => luExecutorAgent,
  "lu-planner": () => luPlannerAgent,
  "lu-premortem": () => luPremortemAgent,
};
