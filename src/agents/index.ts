/**
 * Agent registry for the Luca Framework
 * Auto-generated index file for bulk agent processing
 */

// Import all general agents
import { codeArchitectAgent } from "./general/code-architect.agent";
import { codeDeveloperAgent } from "./general/code-developer.agent";
import { codeSimplifierAgent } from "./general/code-simplifier.agent";
import { luDiscussResearcherAgent } from "./general/lu-discuss-researcher.agent";
import { dxAdvocateAgent } from "./general/dx-advocate.agent";
import { luCodebaseMapperAgent } from "./general/lu-codebase-mapper.agent";
import { luCognitionAgent } from "./general/lu-cognition.agent";
import { luDebuggerAgent } from "./general/lu-debugger.agent";
import { luIntegrationCheckerAgent } from "./general/lu-integration-checker.agent";
import { luLearnerAgent } from "./general/lu-learner.agent";
import { luPhaseResearcherAgent } from "./general/lu-phase-researcher.agent";
import { luPlanCheckerAgent } from "./general/lu-plan-checker.agent";
import { luPmPlannerAgent } from "./general/lu-pm-planner.agent";
import { luPrReviewerAgent } from "./general/lu-pr-reviewer.agent";
import { luRepoArchitectAgent } from "./general/lu-repo-architect.agent";
import { luProjectResearcherAgent } from "./general/lu-project-researcher.agent";
import { luResearchSynthesizerAgent } from "./general/lu-research-synthesizer.agent";
import { luRoadmapperAgent } from "./general/lu-roadmapper.agent";
import { luRouterAgent } from "./general/lu-router.agent";
import { luTestWriterAgent } from "./general/lu-test-writer.agent";
import { luVerifierAgent } from "./general/lu-verifier.agent";
import { performanceAuditorAgent } from "./general/performance-auditor.agent";
import { productAgent } from "./general/product.agent";
import { qaPlanGeneratorAgent } from "./general/qa-plan-generator.agent";
import { securityAuditorAgent } from "./general/security-auditor.agent";
import { uiAgent } from "./general/ui.agent";
import { uxAgent } from "./general/ux.agent";

// Import Luca-specific agents
import { luExecutorAgent } from "./luca/lu-executor.agent";
import { luPlannerAgent } from "./luca/lu-planner.agent";

// Export factory function
export { createAgent } from "./__helpers/create-agent";

// Export model resolution
export {
  resolveModel,
  resolveModelWithZone,
  resolveModelWithDecision,
} from "./__helpers/resolve-model";

export type { ModelRoutingDecision } from "./__helpers/resolve-model";

// Export types
export type {
  AgentConfig,
  AgentFrontmatter,
  AgentSection,
  ModelRoutingConfig,
} from "./__schemas/agent.schemas";

// Import BaseAgent for registry type annotation (also re-exported)
import type { BaseAgent } from "./__schemas/agent.schemas";
export type { BaseAgent };

// Registry mapping agent names to factory functions for bulk processing
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
  "lu-repo-architect": () => luRepoArchitectAgent,
  "lu-project-researcher": () => luProjectResearcherAgent,
  "lu-research-synthesizer": () => luResearchSynthesizerAgent,
  "lu-roadmapper": () => luRoadmapperAgent,
  "lu-router": () => luRouterAgent,
  "lu-test-writer": () => luTestWriterAgent,
  "lu-verifier": () => luVerifierAgent,
  "performance-auditor": () => performanceAuditorAgent,
  product: () => productAgent,
  "qa-plan-generator": () => qaPlanGeneratorAgent,
  "security-auditor": () => securityAuditorAgent,
  ui: () => uiAgent,
  ux: () => uxAgent,
  "lu-executor": () => luExecutorAgent,
  "lu-planner": () => luPlannerAgent,
};
