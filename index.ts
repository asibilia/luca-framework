/**
 * Main entry point for the Luca Framework compiler system
 *
 * This file defines the intentional public API surface.
 * Only symbols listed here are part of the public contract.
 */

// Type interfaces
export type {
  AgentFrontmatter,
  AgentSection,
  AgentConfig,
  BaseAgent,
} from "./src/agents/types/agent.types";

export type {
  SkillFrontmatter,
  SkillSection,
  SkillConfig,
  BaseSkill,
} from "./src/skills/types/skill.types";

export type {
  RuleFrontmatter,
  RuleSection,
  RuleConfig,
  BaseRule,
} from "./src/rules/types/rule.types";

// Shared types
export type { Result } from "./src/shared/types";

// Base class implementations
export { BaseAgentImpl } from "./src/agents/base/base-agent";
export { BaseSkillImpl } from "./src/skills/base/base-skill";
export { createRule } from "./src/rules/base/base-rule";

// Compilers (functional API)
export {
  compileAgent,
  compileSkill,
  compileRule,
  compileAgentClaude,
  compileAgentCursor,
  compileAgentPlugin,
  compileSkillClaude,
  compileSkillCursor,
  compileSkillPlugin,
  compileRuleClaude,
  compileRuleCursor,
  compileRulePlugin,
  validateFormat,
} from "./src/compilers/compile";
export type { SupportedFormat } from "./src/compilers/compile";

// Luca-specific entities
export { LuExecutorAgent } from "./src/agents/luca/lu-executor.agent";
export { LuPlannerAgent } from "./src/agents/luca/lu-planner.agent";
export { LuSkill } from "./src/skills/luca/lu.skill";
export { luWorkflowRule } from "./src/rules/lu-workflow.rule";

// Registries (for build scripts and consumers)
export { agentRegistry } from "./src/agents/index";
export { skillRegistry } from "./src/skills/index";
export { ruleRegistry } from "./src/rules/index";

// Hook registry and types (for build scripts and consumers)
export {
  hookRegistry,
  NO_MATCHER_SENTINEL,
  generateCursorHooksConfig,
  generateClaudeHooksConfig,
} from "./src/hooks/index";
export type { HookDefinition } from "./src/hooks/index";

// Harness API and types (for build scripts and consumers)
export {
  runHarness,
  loadHarnessConfig,
  parserRegistry,
  DEFAULT_HARNESS_CONFIG,
} from "./src/harness/index";
export type {
  HarnessConfig,
  CheckConfig,
  ParsedError,
  CheckResult,
  HarnessResult,
  OutputParser,
} from "./src/harness/index";

// Complexity API and types (for build scripts and consumers)
export {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  COMPLEXITY_TIER,
  meetsThreshold,
  getTier,
  COMPLEXITY_CLASSIFICATIONS,
  DEFAULT_COMPLEXITY_MATRIX,
  DEFAULT_COMPLEXITY_CONFIG,
} from "./src/complexity/index";
export type {
  ComplexityLevel,
  ComplexityTier,
  ComplexityClassification,
  VerificationMode,
  StepActivation,
  ComplexityGate,
  ComplexityMatrix,
  ComplexityConfig,
} from "./src/complexity/index";

// Validation utilities (public-facing)
export {
  sanitizeJsonParse,
  safeSanitizeJsonParse,
  validateAgentConfig,
  validateSkillConfig,
  validateRuleConfig,
  safeValidateAgentConfig,
  safeValidateSkillConfig,
  safeValidateRuleConfig,
} from "./src/shared/validation-utils";
