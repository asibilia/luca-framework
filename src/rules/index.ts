/**
 * Rule registry for the Luca Framework
 *
 * Dynamically assembles the rule registry from:
 * 1. General/framework rules (always loaded)
 * 2. Tech stack profile rules (loaded based on config)
 *
 * Profile loading is controlled by .planning/config.json:
 * - workflow.opinionated_guidelines: master toggle (default: true)
 * - workflow.tech_stack_profiles: array of profile names (default: ["typescript"])
 */

// Import general/framework rules (always active)
import { AtlassianMcpRule } from "./general/atlassian-mcp.rule";
import { ComplexityGatingRule } from "./general/complexity-gating.rule";
import { CursorRulesRule } from "./general/cursor_rules.rule";
import { FileNamingRule } from "./general/file-naming.rule";
import { HarnessVerificationRule } from "./general/harness-verification.rule";
import { HookSkillBoundaryRule } from "./general/hook-skill-boundary.rule";
import { MandatoryDocumentationRule } from "./general/mandatory-documentation.rule";
import { PosthogIntegrationRule } from "./general/posthog-integration.rule";
import { SelfImproveRule } from "./general/self_improve.rule";
import { StateMachineBridgeRule } from "./general/state-machine-bridge.rule";

// Import Luca-specific rule
import { LuWorkflowRule } from "./lu-workflow.rule";

// Import profile registry and config schema
import { profileRegistry, profileConfigSchema } from "./profiles/index";

// Export base rule class
export { BaseRuleImpl } from "./base/base-rule";

// Export types
export type {
  RuleConfig,
  RuleFrontmatter,
  RuleSection,
} from "./types/rule.types";

// Import BaseRule for registry type annotation (also re-exported)
import type { BaseRule } from "./types/rule.types";
export type { BaseRule };

// Re-export profile infrastructure for consumers
export { profileRegistry, profileConfigSchema };
export type { TechStackProfile, ProfileConfig } from "./profiles/index";

// ---------------------------------------------------------------------------
// General rules (always loaded regardless of profile config)
// ---------------------------------------------------------------------------
const generalRules: Record<string, () => BaseRule> = {
  "atlassian-mcp": () => new AtlassianMcpRule(),
  "complexity-gating": () => new ComplexityGatingRule(),
  cursor_rules: () => new CursorRulesRule(),
  "file-naming": () => new FileNamingRule(),
  "harness-verification": () => new HarnessVerificationRule(),
  "hook-skill-boundary": () => new HookSkillBoundaryRule(),
  "mandatory-documentation": () => new MandatoryDocumentationRule(),
  "posthog-integration": () => new PosthogIntegrationRule(),
  self_improve: () => new SelfImproveRule(),
  "state-machine-bridge": () => new StateMachineBridgeRule(),
  "lu-workflow": () => new LuWorkflowRule(),
};

// ---------------------------------------------------------------------------
// Profile-aware rule loading
// ---------------------------------------------------------------------------

/**
 * Read profile config from .planning/config.json at import time.
 *
 * Uses synchronous file read via Bun.file() with a sync fallback.
 * If the config file is missing or malformed, defaults apply via Zod schema.
 */
function loadProfileConfig(): {
  opinionated_guidelines: boolean;
  tech_stack_profiles: string[];
} {
  try {
    const fs = require("fs");
    const path = require("path");
    const configPath = path.join(process.cwd(), ".planning", "config.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const workflow = config?.workflow ?? {};
    return profileConfigSchema.parse(workflow);
  } catch {
    // Fallback to defaults if config is missing or unreadable
    return profileConfigSchema.parse({});
  }
}

/**
 * Collect rules from active tech stack profiles.
 *
 * If opinionated_guidelines is false, no profile rules are loaded.
 * Otherwise, each profile in tech_stack_profiles contributes its rules.
 */
function loadProfileRules(): Record<string, () => BaseRule> {
  const config = loadProfileConfig();

  if (!config.opinionated_guidelines) {
    return {};
  }

  const profileRules: Record<string, () => BaseRule> = {};

  for (const profileName of config.tech_stack_profiles) {
    const profile = profileRegistry[profileName];
    if (profile) {
      Object.assign(profileRules, profile.rules);
    }
  }

  return profileRules;
}

// ---------------------------------------------------------------------------
// Assembled registry: general + profile rules
// ---------------------------------------------------------------------------

/**
 * Complete rule registry combining general rules with active profile rules.
 *
 * This is the single source of truth consumed by the build pipeline
 * (build-shared.ts) to generate .claude/ and .cursor/ rule files.
 */
export const ruleRegistry: Record<string, () => BaseRule> = {
  ...generalRules,
  ...loadProfileRules(),
};
