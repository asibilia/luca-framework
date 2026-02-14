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
  AgentConfig,
  AgentFrontmatter,
  AgentSection,
} from "./types/agent.types";

// Import BaseAgent for registry type annotation (also re-exported)
import type { BaseAgent } from "./types/agent.types";
export type { BaseAgent };

// Registry mapping agent names to factory functions for bulk processing
export const agentRegistry: Record<string, () => BaseAgent> = {
  "code-architect": () => new CodeArchitectAgent(),
  "code-developer": () => new CodeDeveloperAgent(),
  "code-simplifier": () => new CodeSimplifierAgent(),
  "dx-advocate": () => new DxAdvocateAgent(),
  "lu-codebase-mapper": () => new LuCodebaseMapperAgent(),
  "lu-cognition": () => new LuCognitionAgent(),
  "lu-debugger": () => new LuDebuggerAgent(),
  "lu-integration-checker": () => new LuIntegrationCheckerAgent(),
  "lu-learner": () => new LuLearnerAgent(),
  "lu-phase-researcher": () => new LuPhaseResearcherAgent(),
  "lu-plan-checker": () => new LuPlanCheckerAgent(),
  "lu-pm-planner": () => new LuPmPlannerAgent(),
  "lu-pr-reviewer": () => new LuPrReviewerAgent(),
  "lu-project-researcher": () => new LuProjectResearcherAgent(),
  "lu-research-synthesizer": () => new LuResearchSynthesizerAgent(),
  "lu-roadmapper": () => new LuRoadmapperAgent(),
  "lu-router": () => new LuRouterAgent(),
  "lu-verifier": () => new LuVerifierAgent(),
  "performance-auditor": () => new PerformanceAuditorAgent(),
  product: () => new ProductAgent(),
  "qa-plan-generator": () => new QaPlanGeneratorAgent(),
  "security-auditor": () => new SecurityAuditorAgent(),
  ui: () => new UiAgent(),
  ux: () => new UxAgent(),
  "lu-executor": () => new LuExecutorAgent(),
  "lu-planner": () => new LuPlannerAgent(),
};
