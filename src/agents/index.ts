/**
 * Agent registry for the Luca Framework
 * Auto-generated index file for bulk agent processing
 */

// Import all general agents
import { CodeArchitectAgent } from "./general/code-architect.agent";
import { CodeDeveloperAgent } from "./general/code-developer.agent";
import { CodeSimplifierAgent } from "./general/code-simplifier.agent";
import { DxAdvocateAgent } from "./general/dx-advocate.agent";
import { LuCodebaseMapperAgent } from "./general/lu-codebase-mapper.agent";
import { LuCognitionAgent } from "./general/lu-cognition.agent";
import { LuDebuggerAgent } from "./general/lu-debugger.agent";
import { LuIntegrationCheckerAgent } from "./general/lu-integration-checker.agent";
import { LuLearnerAgent } from "./general/lu-learner.agent";
import { LuPhaseResearcherAgent } from "./general/lu-phase-researcher.agent";
import { LuPlanCheckerAgent } from "./general/lu-plan-checker.agent";
import { LuPmPlannerAgent } from "./general/lu-pm-planner.agent";
import { LuPrReviewerAgent } from "./general/lu-pr-reviewer.agent";
import { LuProjectResearcherAgent } from "./general/lu-project-researcher.agent";
import { LuResearchSynthesizerAgent } from "./general/lu-research-synthesizer.agent";
import { LuRoadmapperAgent } from "./general/lu-roadmapper.agent";
import { LuRouterAgent } from "./general/lu-router.agent";
import { LuVerifierAgent } from "./general/lu-verifier.agent";
import { PerformanceAuditorAgent } from "./general/performance-auditor.agent";
import { ProductAgent } from "./general/product.agent";
import { QaPlanGeneratorAgent } from "./general/qa-plan-generator.agent";
import { SecurityAuditorAgent } from "./general/security-auditor.agent";
import { UiAgent } from "./general/ui.agent";
import { UxAgent } from "./general/ux.agent";

// Import Luca-specific agents
import { LuExecutorAgent } from "./luca/lu-executor.agent";
import { LuPlannerAgent } from "./luca/lu-planner.agent";

// Export base agent class
export { BaseAgentImpl } from "./base/base-agent";

// Export types
export type {
  BaseAgent,
  AgentConfig,
  AgentFrontmatter,
  AgentSection,
} from "./types/agent.types";

// Registry mapping agent names to their classes for bulk processing
export const agentRegistry = {
  "code-architect": CodeArchitectAgent,
  "code-developer": CodeDeveloperAgent,
  "code-simplifier": CodeSimplifierAgent,
  "dx-advocate": DxAdvocateAgent,
  "lu-codebase-mapper": LuCodebaseMapperAgent,
  "lu-cognition": LuCognitionAgent,
  "lu-debugger": LuDebuggerAgent,
  "lu-integration-checker": LuIntegrationCheckerAgent,
  "lu-learner": LuLearnerAgent,
  "lu-phase-researcher": LuPhaseResearcherAgent,
  "lu-plan-checker": LuPlanCheckerAgent,
  "lu-pm-planner": LuPmPlannerAgent,
  "lu-pr-reviewer": LuPrReviewerAgent,
  "lu-project-researcher": LuProjectResearcherAgent,
  "lu-research-synthesizer": LuResearchSynthesizerAgent,
  "lu-roadmapper": LuRoadmapperAgent,
  "lu-router": LuRouterAgent,
  "lu-verifier": LuVerifierAgent,
  "performance-auditor": PerformanceAuditorAgent,
  product: ProductAgent,
  "qa-plan-generator": QaPlanGeneratorAgent,
  "security-auditor": SecurityAuditorAgent,
  ui: UiAgent,
  ux: UxAgent,
  // Luca-specific agents (previously compiled separately)
  "lu-executor": LuExecutorAgent,
  "lu-planner": LuPlannerAgent,
};
